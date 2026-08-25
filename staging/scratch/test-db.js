const mongoose = require('mongoose');

const uri = 'mongodb+srv://atharvarrrr7_db_user:KYZ6Ej2htIjL4f4w@littx.mrxmg1s.mongodb.net/littx?retryWrites=true&w=majority&appName=LITTX';

console.log('Testing connection to MongoDB Atlas...');
mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('✅ Connection Successful!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection Failed:', err.message);
    process.exit(1);
  });
