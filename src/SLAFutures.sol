// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { IServiceRegistry } from "./interfaces/IServiceRegistry.sol";

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

    uint256 public constant MIN_PRICE_PER_CALL = 1_000; // 0.001 USDC (6 decimals)
    uint256 public constant MIN_SLOTS = 1;

    IERC20 public immutable usdc;
    IServiceRegistry public immutable registry;

    uint256 public nextBatchId = 1;
    string public baseUri;

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => string) private _batchUris;

    // Required by spec: tracks direct purchases for refund accounting
    mapping(uint256 => mapping(address => uint256)) public purchased;
    mapping(uint256 => mapping(address => uint256)) public refunded;

    constructor(address _usdc, address _registry, address _owner, string memory _baseUri)
        ERC1155("")
        Ownable(_owner)
    {
        usdc = IERC20(_usdc);
        registry = IServiceRegistry(_registry);
        baseUri = _baseUri;
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

        usdc.safeTransferFrom(msg.sender, b.provider, cost);
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
            usdc.safeTransferFrom(msg.sender, address(this), refundReserve);
        }

        emit BatchCancelled(batchId);
    }

    function claimRefund(uint256 batchId) external nonReentrant {
        Batch storage b = batches[batchId];
        if (b.provider == address(0)) revert UnknownBatch();
        if (b.active) revert BatchStillActive();

        uint256 buyerBalance = balanceOf(msg.sender, batchId);
        uint256 refundablePurchased = purchased[batchId][msg.sender] - refunded[batchId][msg.sender];

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
    }

    function setBaseURI(string calldata newBaseUri) external onlyOwner {
        baseUri = newBaseUri;
    }

    function uri(uint256 id) public view override returns (string memory) {
        string memory batchUri = _batchUris[id];
        if (bytes(batchUri).length != 0) {
            return batchUri;
        }
        return string.concat(baseUri, "/", id.toString());
    }
}
