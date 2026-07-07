const https = require('https');
const url = 'https://testnet.arcscan.app/api/v2/smart-contracts/0x0FbC2841d0d56a57C3967472DDCaef825a38de02';
https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log("Geri Donen Veri:");
    console.log(data);
  });
});
