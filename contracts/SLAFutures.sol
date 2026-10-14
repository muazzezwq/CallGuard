// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { IServiceRegistry } from "./interfaces/IServiceRegistry.sol";

// ---------------------------------------------------------------------------
// Chainlink AggregatorV3 — minimal interface for USD price feeds.
// Arc Testnet: set via setPriceFeed() after Chainlink deployment.
// ---------------------------------------------------------------------------
interface IChainlinkAggregator {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract SLAFutures is ERC1155, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    struct Batch {
        uint256 providerId;
        uint256 pricePerCall; // USDC (6 decimals)
        uint256 totalSlots;
        uint256 soldSlots;
        uint256 usedSlots;
        uint64 deadline;
        bool active; // false = cancelled
        address provider; // owner address at mint time
    }

    error InvalidProvider();
    error NotProviderOwner();
    error InvalidPrice();
    error InvalidSlots();
    error InvalidDeadline();
    error UnknownBatch();
    error BatchInactive();
    error BatchExpired();
    error ExceedsAvailableSlots();
    error NotBatchProvider();
    error BatchNotExpired();
    error NothingToBurn();
    error BatchStillActive();
    error NothingToRefund();
    error NothingToClaim();
    error StalePriceFeed();
    error BatchUSDCapExceeded();
    error RefundGraceNotElapsed();

    event BatchMinted(
        uint256 indexed batchId,
        uint256 indexed providerId,
        uint256 pricePerCall,
        uint256 totalSlots,
        uint64 deadline
    );
    event SlotsBought(uint256 indexed batchId, address indexed buyer, uint256 amount);
    event SlotBurned(uint256 indexed batchId, address indexed caller, uint256 indexed providerId);
    event BatchCancelled(uint256 indexed batchId);
    event RefundClaimed(uint256 indexed batchId, address indexed buyer, uint256 amount);
    event ProceedsClaimed(uint256 indexed batchId, address indexed provider, uint256 amount);
    event PriceFeedSet(address indexed feed);
    event PriceFeedStalenessSet(uint256 staleness);
    event BatchURISet(uint256 indexed batchId);
    /// @notice Permissionless expiry cancellation after provider abandonment.
    event BatchExpiredCancelled(uint256 indexed batchId);

    uint256 public constant MIN_PRICE_PER_CALL = 1_000; // 0.001 USDC (6 decimals)
    uint256 public constant MIN_SLOTS = 1;
    /// @notice Grace period after deadline before anyone can cancel an abandoned batch.
    uint256 public constant REFUND_GRACE = 1 days;
    /// @notice Max batch total value in USD cents (8 decimals): $1M = 100_000_000_00000000
    uint256 public constant MAX_BATCH_USD_8DEC = 1_000_000 * 1e8; // $1M cap

    IERC20 public immutable usdc;
    IServiceRegistry public immutable registry;

    /// @notice Chainlink price feed (e.g. USDC/USD). address(0) = disabled.
    IChainlinkAggregator public priceFeed;
    /// @notice Max age of price data in seconds before it is considered stale.
    uint256 public priceFeedStaleness = 3600; // 1 hour default

    uint256 public nextBatchId = 1;
    string public baseUri;

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => string) private _batchUris;

    // Required by spec: tracks direct purchases for refund accounting
    mapping(uint256 => mapping(address => uint256)) public purchased;
    mapping(uint256 => mapping(address => uint256)) public refunded;
    mapping(uint256 => uint256) public providerClaimable;

    constructor(address _usdc, address _registry, address _owner, string memory _baseUri)
        ERC1155("")
        Ownable(_owner)
    {
        usdc = IERC20(_usdc);
        registry = IServiceRegistry(_registry);
        baseUri = _baseUri;
    }

    /// @notice Set the Chainlink price feed for USD batch cap validation.
    ///         Pass address(0) to disable. Only owner can call.
    function setPriceFeed(address feed) external onlyOwner {
        priceFeed = IChainlinkAggregator(feed);
        emit PriceFeedSet(feed);
    }

    /// @notice Update the price feed staleness window (seconds). Only owner.
    function setPriceFeedStaleness(uint256 staleness) external onlyOwner {
        priceFeedStaleness = staleness;
        emit PriceFeedStalenessSet(staleness);
    }

    function mintCapacity(uint256 providerId, uint256 pricePerCall, uint256 totalSlots, uint64 deadline)
        external
        returns (uint256 batchId)
    {
        IServiceRegistry.ProviderView memory p = registry.getProvider(providerId);
        if (p.owner == address(0) || !p.active) revert InvalidProvider();
        if (p.owner != msg.sender) revert NotProviderOwner();
        if (pricePerCall < MIN_PRICE_PER_CALL) revert InvalidPrice();
        if (totalSlots < MIN_SLOTS) revert InvalidSlots();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        // Chainlink USD cap check — skipped when priceFeed not set.
        if (address(priceFeed) != address(0)) {
            (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
            if (answer <= 0 || block.timestamp - updatedAt > priceFeedStaleness) revert StalePriceFeed();
            uint8 feedDec = priceFeed.decimals();
            // batchUSD_8dec = pricePerCall * totalSlots * answer / 10^(6 + feedDec - 8)
            // pricePerCall is 6-decimal USDC; answer is feedDec-decimal USD/USDC
            // result is in 8-decimal USD units for consistent comparison.
            uint256 batchUsdc = pricePerCall * totalSlots; // 6 dec
            uint256 batchUSD8;
            if (feedDec >= 6) {
                batchUSD8 = batchUsdc * uint256(answer) / (10 ** (feedDec - 6 + 6)); // normalize to 8 dec
                batchUSD8 = batchUSD8 * 100; // scale to 8-decimal cents
            } else {
                batchUSD8 = batchUsdc * uint256(answer) * (10 ** (6 - feedDec)) / 1e6 * 100;
            }
            if (batchUSD8 > MAX_BATCH_USD_8DEC) revert BatchUSDCapExceeded();
        }

        batchId = nextBatchId++;

        batches[batchId] = Batch({
            providerId: providerId,
            pricePerCall: pricePerCall,
            totalSlots: totalSlots,
            soldSlots: 0,
            usedSlots: 0,
            deadline: deadline,
            active: true,
            provider: msg.sender
        });

        _batchUris[batchId] = string.concat(baseUri, "/", batchId.toString());

        // No upfront mint — tokens are minted on demand in buySlots.

        emit BatchMinted(batchId, providerId, pricePerCall, totalSlots, deadline);
    }

    function buySlots(uint256 batchId, uint256 amount) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (!b.active) revert BatchInactive();
        if (block.timestamp > b.deadline) revert BatchExpired();
        if (amount == 0) revert InvalidSlots();
        if (b.soldSlots + amount > b.totalSlots) revert ExceedsAvailableSlots();

        uint256 cost = amount * b.pricePerCall;

        b.soldSlots += amount;
        purchased[batchId][msg.sender] += amount;
        providerClaimable[batchId] += cost;

        usdc.safeTransferFrom(msg.sender, address(this), cost);
        _mint(msg.sender, batchId, amount, "");

        emit SlotsBought(batchId, msg.sender, amount);
    }

    function burnSlot(uint256 batchId) external {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (!b.active) revert BatchInactive();
        if (block.timestamp > b.deadline) revert BatchExpired();
        if (balanceOf(msg.sender, batchId) == 0) revert NothingToBurn();

        b.usedSlots += 1;
        _burn(msg.sender, batchId, 1);

        emit SlotBurned(batchId, msg.sender, b.providerId);
    }

    function cancelBatch(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (msg.sender != b.provider) revert NotBatchProvider();
        if (!b.active) revert BatchInactive();
        if (block.timestamp <= b.deadline) revert BatchNotExpired();

        b.active = false;

        uint256 refundableSlots = b.soldSlots - b.usedSlots;
        if (refundableSlots > 0) {
            uint256 refundReserve = refundableSlots * b.pricePerCall;
            providerClaimable[batchId] -= refundReserve;
        }

        emit BatchCancelled(batchId);
    }

    /// @notice Permissionless cancellation of an abandoned batch.
    ///         If the provider never calls cancelBatch, anyone can open the
    ///         refund path once deadline + REFUND_GRACE has passed.
    function cancelExpiredBatch(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (!b.active) revert BatchInactive();
        if (block.timestamp <= b.deadline + REFUND_GRACE) revert RefundGraceNotElapsed();

        b.active = false;

        uint256 refundableSlots = b.soldSlots - b.usedSlots;
        if (refundableSlots > 0) {
            uint256 refundReserve = refundableSlots * b.pricePerCall;
            providerClaimable[batchId] -= refundReserve;
        }

        emit BatchCancelled(batchId);
        emit BatchExpiredCancelled(batchId);
    }

    function claimProceeds(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (msg.sender != b.provider) revert NotBatchProvider();
        if (b.active) revert BatchStillActive();

        uint256 claimable = providerClaimable[batchId];
        if (claimable == 0) revert NothingToClaim();

        providerClaimable[batchId] = 0;
        usdc.safeTransfer(msg.sender, claimable);

        emit ProceedsClaimed(batchId, msg.sender, claimable);
    }

    function claimRefund(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (b.active) revert BatchStillActive();

        uint256 totalPurchased = purchased[batchId][msg.sender];
        uint256 alreadyRefunded = refunded[batchId][msg.sender];
        if (alreadyRefunded > totalPurchased) revert NothingToRefund();
        uint256 refundablePurchased = totalPurchased - alreadyRefunded;
        uint256 buyerBalance = balanceOf(msg.sender, batchId);

        uint256 amount = buyerBalance < refundablePurchased ? buyerBalance : refundablePurchased;
        if (amount == 0) revert NothingToRefund();

        refunded[batchId][msg.sender] += amount;
        _burn(msg.sender, batchId, amount);

        uint256 refundValue = amount * b.pricePerCall;
        usdc.safeTransfer(msg.sender, refundValue);

        emit RefundClaimed(batchId, msg.sender, amount);
    }

    function setBatchURI(uint256 batchId, string calldata newUri) external {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (msg.sender != b.provider) revert NotBatchProvider();

        _batchUris[batchId] = newUri;
        emit BatchURISet(batchId);
    }

    function setBaseURI(string calldata newBaseUri) external onlyOwner {
        baseUri = newBaseUri;
    }

    /// @notice Keep refund credit attached to the token on secondary transfers.
    /// @dev Moves min(transferAmount, senderRefundable) of `purchased` credit
    ///      from sender to receiver so claimRefund works for the new holder.
    ///      Mint (from=0) and burn (to=0) paths are skipped.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                uint256 id = ids[i];
                uint256 amt = values[i];
                if (amt == 0) continue;
                uint256 senderTotal = purchased[id][from];
                uint256 senderRef = refunded[id][from];
                uint256 senderRefundable = senderTotal > senderRef ? senderTotal - senderRef : 0;
                uint256 move = amt < senderRefundable ? amt : senderRefundable;
                if (move > 0) {
                    purchased[id][from] -= move;
                    purchased[id][to] += move;
                }
            }
        }
        super._update(from, to, ids, values);
    }

    function uri(uint256 id) public view override returns (string memory) {

        string memory batchUri = _batchUris[id];
        if (bytes(batchUri).length != 0) {
            return batchUri;
        }
        return string.concat(baseUri, "/", id.toString());
    }
}
