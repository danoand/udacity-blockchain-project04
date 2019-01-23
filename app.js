//Importing Express.js module
const express = require("express");
//Importing BodyParser.js module
const bodyParser = require("body-parser");
// Import the crypto-js sha256 module
const SHA256 = require('crypto-js/sha256');
const bitcoinMessage = require('bitcoinjs-message');
const hex2ascii = require('hex2ascii');
const { db, addLevelDBData, getLevelDBData, echoDB, clearDB, numBlocks, getLevelDBDataByHash } = require('./levelSandbox');

// Other constants
const TimeoutRequestsWindowTime = 5 * 60 * 1000; 

/* ===== Block Class ==============================
|  Class with a constructor for block 			   |
|  ===============================================*/

class Block {
	constructor(data) {
		this.hash = "",
			this.height = 0,
			this.body = data,
			this.time = 0,
			this.previousBlockHash = ""
	}
}

/* ===== Blockchain Class ==========================
|  Class with a constructor for new blockchain 		|
|  ================================================*/

class Blockchain {
	constructor() {
		this.init();
	}

	async init() {
		var num = await numBlocks();

		// Any key/value pairs in the levelDB?
		if (num == 0) {
			// no: insert the 'genesis' block
			await this.addBlock(new Block("First block in the chain - Genesis block"));
		}
	}

	// Add new block
	async addBlock(newBlock) {
		// Get the current block height
		var curHeight = await this.getBlockHeight();

		// Set the new block's height
		newBlock.height = curHeight + 1;

		// Generate a UTC timestamp
		newBlock.time = new Date().getTime().toString().slice(0, -3);

		// Processing a non-genesis block?
		if (newBlock.height != 0) {
			// Generate the previous block's hash
			var lastBlock = await this.getBlock(curHeight);
			newBlock.previousBlockHash = lastBlock.hash;
		}

		// Block hash with SHA256 using newBlock and converting to a string
		newBlock.hash = SHA256(JSON.stringify(newBlock)).toString();

		// Store the new block to the levelDB
		await addLevelDBData(newBlock.height, JSON.stringify(newBlock));

		return newBlock;
	}

	// Get block height
	async getBlockHeight() {
		var nBlocks = await numBlocks();

		// Return the height of the blockchain 
		return nBlocks - 1;
	}

	// get block by height value
	async getBlock(blockHeight) {
		var tmpBlock = await getLevelDBData(blockHeight);
		return JSON.parse(tmpBlock);
	}

	// get block by hash value
	async getBlockByHash(blockhash) {
		var tmpBlock = await getLevelDBDataByHash(blockhash);
		return JSON.parse(tmpBlock);
	}

	// validate block
	async validateBlock(blockHeight) {
		// get block object
		var tmpBlock = await this.getBlock(blockHeight);
		// get block hash
		var tmpBlockHash = tmpBlock.hash;
		// remove block hash to test block integrity
		tmpBlock.hash = '';
		// generate block hash
		var validBlockHash = SHA256(JSON.stringify(tmpBlock)).toString();
		// Compare
		if (tmpBlockHash === validBlockHash) {
			return true;
		} else {
			console.log('Block #' + blockHeight + ' invalid hash:\n' + tmpBlockHash + '<>' + validBlockHash);
			return false;
		}
	}

	// Validate blockchain
	async validateChain() {
		var errorLog = [];

		// Determine the height of the blockchain
		var hgt = await this.getBlockHeight();

		// Iterate through the chain of blocks
		for (let i = 0; i < hgt; i++) {
			// Validate the block
			var isValid = await this.validateBlock(i);
			if (!isValid) errorLog.push(i);

			// Compare the blocks' hash links
			var curBlock = await this.getBlock(i);
			var nextBlock = await this.getBlock(i + 1);

			// Expected hash relationship between adjacent blocks?
			var blockHash = curBlock.hash;
			var previousHash = nextBlock.previousBlockHash;
			if (blockHash !== previousHash) {
				errorLog.push(i);
			}
		}

		// Validate the last block in the chain
		if (hgt > 0) {
			var flgVal = await this.validateBlock(hgt);
			if (!flgVal) {
				// invalid block
				errorLog.push(hgt);
			}
		}

		if (errorLog.length > 0) {
			console.log('Block errors = ' + errorLog.length);
			console.log('Blocks: ' + errorLog);
			return false;
		} else {
			console.log('No errors detected');
			return true;
		}
	}
}

/**
 * Class Definition for the REST API
 */
class BlockAPI {

    /**
     * Constructor that allows initialize the class 
     */
	constructor() {
		this.app = express();
		this.initExpress();
		this.initExpressMiddleWare();
		this.initControllers();
		this.start();
	}

    /**
     * Initilization of the Express framework
     */
	initExpress() {
		this.app.set("port", 8000);
	}

    /**
     * Initialization of the middleware modules
     */
	initExpressMiddleWare() {
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.app.use(bodyParser.json());
	}

    /**
     * Initilization of all the controllers
     */
	initControllers() {
		new BlockController(this.app);
	}

    /**
     * Starting the REST Api application
     */
	start() {
		let self = this;
		this.app.listen(this.app.get("port"), () => {
			console.log(`Server Listening for port: ${self.app.get("port")}`);
		});
	}

}

/**
 * Controller Definition to encapsulate routes to work with blocks
 */
class BlockController {

    /**
     * Constructor to create a new BlockController, you need to initialize here all your endpoints
     * @param {*} app 
     */
	constructor(app) {
		this.app = app;
		this.blockchain = new Blockchain;
		this.mempool = new BlockChainMempool;

		// Stand up routes and conrollers
		this.getBlockByIndex();
		this.getBlockByHash();
		this.postNewBlock();

		this.postRequestValidation();
		this.validateSignature();

		this.echoMempool();
		this.echoAccessList();
	}

	echoMempool() {
		this.app.get("/echomempool", (req, res) => {

			// Get a copy of the mempool
			var retObj = this.mempool.EchoMempool();

			// Return to the caller
			res.status(200).json(retObj);
		});
	}

	echoAccessList() {
		this.app.get("/echoaccesslist", (req, res) => {

			// Get a copy of the mempool
			var retObj = this.mempool.EchoAccessList();

			// Return to the caller
			res.status(200).json(retObj);
		});
	}

	/**
     * postRequestValidation declares a controller that responds to '/requestValidation'
	 * The controller validates a star registry request
     */
	postRequestValidation() {
		this.app.post("/requestValidation", (req, res) => {
			// Read the request body data
			var reqAddr = req.body.address;

			// Missing data?
			if (reqAddr == "" || reqAddr == undefined) {
				// address or signature data is missing from the request
				console.log('ERROR: address data is missing');
				res.status(400).json({ msg: "address data is missing" });
				return;
			}

			// Add the request to the mempool
			var retObj = this.mempool.AddRequestValidation(reqAddr);

			// Return to the caller
			res.status(200).json(retObj);
		});
	}

	validateSignature() {

		this.app.post("/message-signature/validate", (req, res) => {
			// Read the request body data
			var reqAddr = req.body.address;
			var reqSign = req.body.signature;

			// Missing data?
			if (reqAddr == "" || reqAddr == undefined || reqSign == "" || reqSign == undefined) {
				// address or signature data is missing from the request
				console.log('ERROR: address or signature data is missing');
				res.status(400).json({ msg: "address or signature data is missing" });
				return;
			}

			// Is there a request object in the mempool?
			var tObj = this.mempool.GetFromMempool(reqAddr);
			if (!tObj.valid) {
				// no valid object resident in the mempool
				console.log('INFO: no valid mempool object found');
				res.status(400).json({ msg: "no valid mempool object found" });
				return;
			}

			// Verify the message
			var vObj = this.mempool.validateRequestByWallet(reqAddr, reqSign);
			if (!vObj.verified) {
				console.log('INFO: signed message not verified');
				res.status(400).json({ msg: vObj.msg });
				return;
			}

			// Grant access to the user register a single star
			this.mempool.GrantAccessToUser(reqAddr);

			// Construct the return object
			var retObj = {};
			retObj["registerStar"] = true;

			var subObj = {};
			subObj["address"] = tObj['data']['walletAddress'];
			subObj["requestTimeStamp"] = tObj['data']['requestTimeStamp'];
			subObj["message"] = tObj['data']['message'];
			subObj["validationWindow"] = tObj['data']['validationWindow'];
			subObj["messageSignature"] = true;

			retObj["status"] = subObj;

			// Return to the caller
			res.status(200).json(retObj);
		});

	}

    /**
     * Implement a GET Endpoint to retrieve a block by index, url: "/block/:index"
     */
	getBlockByIndex() {
		this.app.get("/block/:index", async (req, res) => {
			// Convert the index parameter to an integer (index value)
			var stridx = req.params.index;
			var idx = parseInt(stridx, 10);

			// Validate the index parameter
			if (isNaN(idx)) {
				console.log('ERROR: index value is not a number:', stridx);
				res.status(400).send({ error: 'index value: ' + stridx + ' is not a valid number' });
				return;
			}

			// Fetch the number of blocks in the blockchain
			var totBlks = await numBlocks();

			// Is the index out of range?
			if (idx >= totBlks || idx < 0) {
				// Referring to a block that does not exist
				console.log('ERROR: block with index:', stridx, 'does not exist');
				res.status(404).send({ error: 'block # ' + stridx + ' does not exist' });
				return;
			}

			// Fetch the block index by ':index'
			var jobj = await this.blockchain.getBlock(idx);

			// Is there a star property?
			if (jobj.body.star == undefined) {
				// current block does not have a star property - return
				console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
				res.status(200).json(jobj);
				return;
			}

			// Is there a story property?
			if (jobj.body.star.story == undefined) {
				// current block does not have a star property - return
				console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
				res.status(200).json(jobj);
				return;
			}

			// Decode hex story (if it's a string value)
			if (typeof jobj.body.star.story == 'string') {
				jobj.body.star.storyDecoded = hex2ascii(jobj.body.star.story);
			}

			// Return the data to the caller
			console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
			res.status(200).json(jobj);
		});
	}

    /**
     * Implement a POST Endpoint to add a new Block, url: "/block"
     */
	postNewBlock() {
		this.app.post("/block", async (req, res) => {
			// Grab the request body data
			var addr = req.body.address;
			var star = req.body.star;

			// Is the request body empty?
			if (addr == undefined || addr == "" || star == undefined || star == "") {
				// block data missing
				console.log('ERROR: request data is missing; check your request and try again');
				res.status(400).send({ error: 'request data is missing; check your request and try again' });
				return;
			}

			// Is star data missing?
			if (typeof star !== 'object' || star == null) {
				// star data is not an object (as expected)
				console.log('ERROR: star data is missing or invalid; check your request and try again');
				res.status(400).send({ error: 'star data is missing or invalid; check your request and try again' });
				return;
			}

			// Are star properties missing?
			if (star.dec == undefined || star.dec == "") {
				// star data is missing the dec property
				console.log('ERROR: star dec property is missing; check your request and try again');
				res.status(400).send({ error: 'star dec property is missing; check your request and try again' });
				return;
			}
			if (star.ra == undefined || star.ra == "") {
				// star data is missing the ra property
				console.log('ERROR: star ra property is missing; check your request and try again');
				res.status(400).send({ error: 'star ra property is missing; check your request and try again' });
				return;
			}
			if (star.story == undefined || star.story == "") {
				// star data is missing the story property
				console.log('ERROR: star story property is missing; check your request and try again');
				res.status(400).send({ error: 'star story property is missing; check your request and try again' });
				return;
			}

			// Has the inbound address been granted access to create a star?
			if (!this.mempool.HasGrantAccessToUser(addr)) {
				// this address (user) has not been granted access to create a star
				console.log('NOT AUTHORIZED: user has not been granted access to create a star:', addr);
				res.status(401).send({ error: 'user has not been granted access to create a star' });
				return;
			}

			// Create a new Block
			var tBlock = new Block;
			star.story = Buffer(star.story).toString('hex');
			var tBody = {"address": addr, "star": star};
			tBlock.body = tBody; 

			// Add block to the blockchain
			var rBlock = await this.blockchain.addBlock(tBlock);

			// Write informational console messages
			console.log('INFO: just created a new block:', JSON.stringify(rBlock));

			// Clean up mempool validated & granted access maps
			this.mempool.RemoveAccessFromUser(addr);
			this.mempool.RemoveFromMempool(addr);

			// Return to caller
			res.status(200).json(rBlock);
			return;
		});
	}

    /**
     * Implement a GET Endpoint to retrieve a block by hash, url: "/stars/hash:<hashvalue>"
     */
	getBlockByHash() {
		this.app.get(/\/stars\/hash:.+/, async (req, res) => {
			// Extract the hash value
			var path = req.path;
			var pathArr = path.split("/");
			if (pathArr.length != 3) {
				// invalid path
				console.log('ERROR: invalid path:', path);
				res.status(400).send({ error: 'invalid path: ' + path });
				return;
			}

			// Extract the hash value
			var hValArr = pathArr[2].split(":");
			if (hValArr.length <= 1) {
				// missing hash value
				console.log('ERROR: missing hash value');
				res.status(400).send({ error: 'missing hash value' });
				return;
			}
			var hsh = hValArr[1];
			if (hsh == "") {
				// empty hash value
				console.log('ERROR: empty hash value');
				res.status(400).send({ error: 'empty hash value' });
				return;
			}

			// Fetch the block index by hash
			console.log("DEBUG: getting block with hash value:", hsh);
			var jobj = await this.blockchain.getBlockByHash(hsh);

			// Null value?
			if (jobj == null) {
				console.log('ERROR: found a null value when searching for a block with hash:', hsh);
				res.status(400).send({ error: 'found a null value when searching for a block' });
				return;
			}

			// Is there a star property?
			if (jobj.body.star == undefined) {
				// current block does not have a star property - return
				console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
				res.status(200).json(jobj);
				return;
			}

			// Is there a story property?
			if (jobj.body.star.story == undefined) {
				// current block does not have a star property - return
				console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
				res.status(200).json(jobj);
				return;
			}

			// Decode hex story (if it's a string value)
			if (typeof jobj.body.star.story == 'string') {
				jobj.body.star.storyDecoded = hex2ascii(jobj.body.star.story);
			}

			// Return the data to the caller
			console.log('INFO: returning to the caller with block:', JSON.stringify(jobj));
			res.status(200).json(jobj);
		});
	}
}

/**
 * Class Definition for mempool
 */
class BlockChainMempool {

	/**
	 * Constructor to define the blockchain's mempool
	 */
	constructor() {
		this.mempool = {};
		this.accessgranted = {};
	}

	/**
     * Method to return the contents of the mempool
     */
	EchoMempool() {
		console.log('DEBUG: The mempool is currently:', JSON.stringify(this.mempool));

		return this.mempool;
	}

	EchoAccessList() {
		console.log('DEBUG: The access list is currently:', JSON.stringify(this.accessgranted));

		return this.accessgranted;
	}

	/**
     * GetFromMempool returns a valid (not expired) object from the mempool
     */
	GetFromMempool(addr) {
		var retObj = {};
		retObj["valid"] = false;

		// Fetch the object from the mempool
		var tmpObj = this.mempool[addr];
		if (tmpObj == undefined) {
			// object not found - expired?
			return retObj;
		}

		// Has the current object expired?
		var wndo = tmpObj['requestTimeStampExpire'] - Date.now();
		if (wndo <= 0) {
			// the object's expiration date has passed
			// delete the object from the mempool
			delete this.mempool[addr];

			return retObj;
		}

		// Valid mempool object
		retObj["valid"] = true;
		tmpObj['validationWindow'] = wndo;
		retObj["data"] = tmpObj;

		return retObj;
	}

	/**
     * RemoveFromMempool removes an object from the mempool
     */
	RemoveFromMempool(addr) {
		delete this.mempool[addr];
	}

	/**
     * Method to add a request to the mempool
     */
	AddRequestValidation(addr) {
		// Does the object with key addr exist in the mempool?
		if (this.mempool.hasOwnProperty(addr)) {
			// Object already in the mempool; return the object to the caller
			this.mempool[addr]['validationWindow'] = this.mempool[addr]['requestTimeStampExpire'] - Date.now(); // Update the validation window value

			console.log('DEBUG: object already exists and returning:', JSON.stringify(this.mempool[addr]));  // TODO: remove debug statement
			return this.mempool[addr];
		}

		// Construct an object to be placed in the mempool
		var tmpObj = {};
		tmpObj['walletAddress'] = addr;
		tmpObj['requestTimeStamp'] = Date.now();
		tmpObj['message'] = addr + ':' + tmpObj['requestTimeStamp'] + ':' + 'starRegistry';
		tmpObj['validationWindow'] = TimeoutRequestsWindowTime;
		tmpObj['requestTimeStampExpire'] = tmpObj['requestTimeStamp'] + TimeoutRequestsWindowTime;

		// Add the object to the mempool
		this.mempool[addr] = tmpObj;
		console.log('DEBUG: just added this object to the mempool. The mempool is now:', JSON.stringify(this.mempool));  // TODO: remove debug statement

		// Delete the mempool object sometime in the future
		var thisMPool = this; // assign 'this' to a variable so it is preserved and referred to properly in the setTimeout function scope
		setTimeout(function () {
			console.log('DEBUG: deleting this address from the mempool:', addr); // TODO: remove debug statement
			delete thisMPool.mempool[addr];
		}, TimeoutRequestsWindowTime);

		return tmpObj;
	}

	/**
     * validateRequestByWallet validates an inbound signing request
     */
	validateRequestByWallet(addr, sgtr) {
		// Does the object with key addr exist in the mempool?
		var retObj = {};
		retObj.verified = false;

		// Fetch the object from the mempool
		var tmpObj = this.mempool[addr];
		if (tmpObj == undefined) {
			// object not found - expired?
			retObj.msg = "no address object in the mempool";
			return retObj;
		}

		// Has the current object expired?
		if (tmpObj['requestTimeStampExpire'] - Date.now() < 0) {
			// the object's expiration date has passed
			retObj.msg = "expiration date has passed";

			// delete the object from the mempool
			delete this.mempool[addr];

			return retObj;
		}

		// Validate the signed message
		var isValid = bitcoinMessage.verify(tmpObj["message"], addr, sgtr);
		if (!isValid) {
			// the message is not valid
			retObj.msg = "invalid/unverified message";
			return retObj;
		}

		// Verified signed message
		retObj.verified = true;
		retObj.msg = "verified signed message";

		return retObj;
	}

	/**
     * GrantAccessToUser grants access to a user (address) to register a single star
     */
	GrantAccessToUser(addr) {
		this.accessgranted[addr] = true;
		// TODO: log a message?
	}

	/**
     * HasGrantAccessToUser determines if an address (user) has granted access
     */
	HasGrantAccessToUser(addr) {
		var rval = false;
		if (this.accessgranted[addr]) {
			rval = true;
		}

		return rval;
	}

	/**
     * RemoveAccessFromUser removes access from a user (address) to register a single star
     */
	RemoveAccessFromUser(addr) {
		delete this.accessgranted[addr];
		// TODO: log a message?
	}

}

new BlockAPI();

module.exports = {
	Block: Block,
	Blockchain: Blockchain,
	BlockAPI: BlockAPI,
	BlockController: BlockController
}