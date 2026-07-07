const https = require('https');
const fs = require('fs');
const contracts = {
  'ServiceRegistry': '0x0FbC2841d0d56a57C3967472DDCaef825a38de02',
  'PayPerCall': '0x1A64e531Dc7498931A658F14AD6801108F372ed8',
  'CrossChainReceiver': '0x9dA167e0d99de5aE8651449eaebB44ceDFE96F04',
  'RegisterWithNFT': '0x8910495C2a876c7b59a175CAc09F823B688b0eEb'
};
async function fetchABI(name, address) {
  const url = 'https://testnet.arcscan.app/api/v2/smart-contracts/' + address;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if(json.abi) {
            fs.writeFileSync(name + '.json', JSON.stringify(json.abi, null, 2));
            console.log('✅ ' + name + ' gercek ABI ile guncellendi.');
          } else {
            console.log('❌ ' + name + ' ABI bulunamadi.');
          }
        } catch(e) { console.log('❌ Hata: ' + e.message); }
        resolve();
      });
    }).on('error', (e) => { console.log('❌ Ag hatasi'); resolve(); });
  });
}
(async () => {
  for (const [name, address] of Object.entries(contracts)) {
    await fetchABI(name, address);
  }
})();
