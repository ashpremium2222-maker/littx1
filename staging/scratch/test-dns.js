const dns = require('dns');

dns.resolve('littx.mrxmg1s.mongodb.net', 'A', (err, addresses) => {
  if (err) {
    console.error('DNS error:', err);
  } else {
    console.log('DNS Addresses:', addresses);
  }
});
