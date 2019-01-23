/* ===== Persist data with LevelDB ===================================
|  Learn more: level: https://github.com/Level/level     |
|  =============================================================*/

const level = require('level');
const chainDB = './chaindata';
const db = level(chainDB);

// Add data to levelDB with key/value pair
function addLevelDBData(key, value) {
  return db.put(key, value);
}

// Get data from levelDB with key 
function getLevelDBData(key) {
  return db.get(key);
}

// numBlocks returns the number of blocks in the data store
function numBlocks() {
  return new Promise((resolve, reject) => {
    var idx = 0;
    db.createKeyStream()
      .on('data', (data) => { idx++ })
      .on('error', function (err) { console.log('Error reading stream:', err); reject(err) })
      .on('close', () => { resolve(idx) });
  });
}

// Add data to levelDB with value
function addDataToLevelDB(value) {
  var idx = 0;
  db.createReadStream().on('data', function (data) {
    idx++;
  }).on('error', function (err) {
    return console.log('Unable to read data stream!', err)
  }).on('close', function () {
    console.log('Block #' + idx);
    addLevelDBData(idx, value);
  });
}

// Clear the levelDB 
async function clearDB() {
  db.createKeyStream()
    .on('data', function (key) {
      db.del(key, function (err) {
        if (err)
          console.log("error removing block:", err);
      });
    });
}

// Echo the levelDB
async function echoDB() {
  var idx = 0;
  db.createReadStream()
    .on('data', function (data) {
      console.log('DB Entry: #', idx, 'Key:', data.key, '=', data.value);
      idx++;
    })
    .on('error', function (err) {
      console.log('Error reading a key value pair:', err);
    })
    .on('close', function () {
      console.log('Stream closed');
    })
    .on('end', function () {
      console.log('Stream ended');
    });
}

// Fetch block by hash
function getLevelDBDataByHash(hsh) {
  let block = null;

  return new Promise((resolve, reject) => {
    db.createReadStream()
      .on('data', (data) => {
        console.log("DEBUG: in 'on data' with block data:", data.value);

        var tObj = JSON.parse(data.value);

        if (tObj) {
          
        }
        if (tObj.hash != undefined) {
          // object has a has property of some type
          if (tObj.hash == hsh) {
            block = data.value;
          }
        }
      })
      .on('error', function (err) { console.log('Error finding block by hash:', err); reject(err) })
      .on('close', () => { 
        if (block == null) {
          console.log("DEBUG: returning a null block!", hsh);
        }
        resolve(block);
       });
  });
}

// Fetch block by address
function getLevelDBDataByAddress(addr) {
  let blocks = [];

  return new Promise((resolve, reject) => {
    db.createReadStream()
      .on('data', (data) => {
        console.log("DEBUG: in 'on data' with block data:", data.value);

        var tObj = JSON.parse(data.value);
        if (tObj.body == undefined) {
          // no body property present
          return;
        }
        if (tObj.body.address == undefined) {
          // no address property present
          return;
        }

        // Matching address value?
        if (tObj.body.address == addr) {
          blocks.push(tObj);
        }
      })
      .on('error', function (err) { console.log('Error finding block by address:', err); reject(err) })
      .on('close', () => { 
        if (blocks.length == null) {
          console.log("DEBUG: returning a null block!", hsh);
        }
        resolve(blocks);
       });
  });
}

module.exports = {
  db: db,
  addLevelDBData: addLevelDBData,
  getLevelDBData: getLevelDBData,
  getLevelDBDataByHash: getLevelDBDataByHash,
  getLevelDBDataByAddress: getLevelDBDataByAddress,
  echoDB: echoDB,
  clearDB: clearDB,
  numBlocks: numBlocks
}
