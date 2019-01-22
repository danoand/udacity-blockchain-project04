//Importing Express.js module
const express = require("express");
//Importing BodyParser.js module
const bodyParser = require("body-parser");
// Import the crypto-js sha256 module
const SHA256 = require('crypto-js/sha256');
const { db, addLevelDBData, getLevelDBData, echoDB, clearDB, numBlocks } = require('./levelSandbox');

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

	// get block
	async getBlock(blockHeight) {
		var tmpBlock = await getLevelDBData(blockHeight);
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
		this.getBlockByIndex();
		this.postNewBlock();
	}

    /**
     * Implement a GET Endpoint to retrieve a block by index, url: "/api/block/:index"
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
				res.status(404).send({ error: 'block # ' +  stridx + ' does not exist'});
				return;
			}

			// Fetch the block index by ':index'
			var jstr = await this.blockchain.getBlock(idx);

			// Return the data to the caller
			console.log('INFO: returning to the caller with block:', jstr);
			res.status(200).json(jstr);
		});
	}

    /**
     * Implement a POST Endpoint to add a new Block, url: "/api/block"
     */
	postNewBlock() {
		this.app.post("/block", async (req, res) => {
			// Read the request body data
			var rBody = req.body.body;

			// Is the request body empty?
			if (rBody == undefined || rBody == "") {
				// block data missing
				console.log('ERROR: block data is missing; check your request and try again');
				res.status(400).send({ error: 'block data is missing; check your request and try again' });
				return;
			}

			// Create a new Block
			var tBlock = new Block;
			tBlock.body = rBody; // Set the Block data

			// Add block to the blockchain
			var rBlock = await this.blockchain.addBlock(tBlock);

			// Write informational console messages
			console.log('INFO: just created a new block with data:', rBlock);

			// Return to the caller
			res.status(200).json(rBlock);
		});
	}
}

new BlockAPI();

module.exports = {
	Block: Block,
	Blockchain: Blockchain,
	BlockAPI: BlockAPI,
	BlockController: BlockController
}