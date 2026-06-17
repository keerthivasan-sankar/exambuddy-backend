const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://kkeerthivasan811_db_user:exambuddy123@exambuddy-cluster.k780tqu.mongodb.net/exambuddy?retryWrites=true&w=majority';

async function test() {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        console.log('✅ MONGODB CONNECTED!');
        await client.close();
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

test();