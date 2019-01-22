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

module.exports = {
  db: db,
  addLevelDBData: addLevelDBData,
  getLevelDBData: getLevelDBData,
  echoDB: echoDB,
  clearDB: clearDB,
  numBlocks: numBlocks,
}
