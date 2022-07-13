'use strict';
const shim = require('fabric-shim');
const util = require('util');

/************************************************************************************************
 * 
 * GENERAL FUNCTIONS TRANSACTION CHAINCODE
 * 
 ************************************************************************************************/

/**
 * Executes a query using a specific key
 * 
 * @param {*} key - the key to use in the query
 */
async function queryByKey(stub, key) {
    console.log('============= START : queryByKey ===========');
    console.log('##### queryByKey key: ' + key);

    let resultAsBytes = await stub.getState(key);
    if (!resultAsBytes || resultAsBytes.toString().length <= 0) {
        throw new Error('##### queryByKey key: ' + key + ' does not exist');
    }
    console.log('##### queryByKey response: ' + resultAsBytes);
    console.log('============= END : queryByKey ===========');
    return resultAsBytes;
}
/**
 * Executes a query based on a provided queryString
 * 
 * I originally wrote this function to handle rich queries via CouchDB, but subsequently needed
 * to support LevelDB range queries where CouchDB was not available.
 * 
 * @param {*} queryString - the query string to execute
 */
async function queryByStringWorklog(stub, queryString) {
    console.log('============= START : queryByStringSWTransmgmt ===========');
    console.log("##### queryByStringSWTransmgmt queryString: " + queryString);

    // CouchDB Query
    // let iterator = await stub.getQueryResult(queryString);

    // Equivalent LevelDB Query. We need to parse queryString to determine what is being queried
    // In this chaincode, all queries will either query ALL records for a specific docType, or
    // they will filter ALL the records looking for a specific NGO, Donor, Donation, etc. So far, 
    // in this chaincode there is a maximum of one filter parameter in addition to the docType.
    let docType = "";
    let startKey = "";
    let endKey = "";
    let jsonQueryString = JSON.parse(queryString);
    if (jsonQueryString['selector'] && jsonQueryString['selector']['docType']) {
        docType = jsonQueryString['selector']['docType'];
        startKey = docType;
        endKey = docType;
    } else {
        throw new Error('##### queryByStringSWTransmgmt - Cannot call queryByString without a docType element: ' + queryString);
    }

    let iterator = await stub.getHistoryForKey(startKey);

    // Iterator handling is identical for both CouchDB and LevelDB result sets, with the 
    // exception of the filter handling in the commented section below
    let allResults = [];
    while (true) {
        let res = await iterator.next();

        if (res.value && res.value.value.toString()) {
            let jsonRes = {};
            console.log('##### queryByStringSWmgmt iterator: ' + res.value.value.toString('utf8'));

            jsonRes.Key = res.value.key;
            try {
                jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
            } catch (err) {
                console.log('##### queryByString error: ' + err);
                jsonRes.Record = res.value.value.toString('utf8');
            }
            // ******************* LevelDB filter handling ******************************************
            // LevelDB: additional code required to filter out records we don't need
            // Check that each filter condition in jsonQueryString can be found in the iterator json
            // If we are using CouchDB, this isn't required as rich query supports selectors
            let jsonRecord = jsonQueryString['selector'];
            // If there is only a docType, no need to filter, just return all
            console.log('##### queryByStringSWTransmgmt jsonRecord - number of JSON keys: ' + Object.keys(jsonRecord).length);
            if (Object.keys(jsonRecord).length == 1) {
                allResults.push(jsonRes);
                continue;
            }
            for (var key in jsonRecord) {
                if (jsonRecord.hasOwnProperty(key)) {
                    console.log('##### queryByStringSWTransmgmt jsonRecord key: ' + key + " value: " + jsonRecord[key]);
                    if (key == "docType") {
                        continue;
                    }
                    console.log('##### queryByStringSWTransmgmt json iterator has key: ' + jsonRes.Record[key]);
                    if (!(jsonRes.Record[key] && jsonRes.Record[key] == jsonRecord[key])) {
                        // we do not want this record as it does not match the filter criteria
                        continue;
                    }
                    allResults.push(jsonRes);
                }
            }
            // ******************* End LevelDB filter handling ******************************************
            // For CouchDB, push all results
            // allResults.push(jsonRes);
        }
        if (res.done) {
            await iterator.close();
            console.log('##### queryByStringSWTransmgmt all results: ' + JSON.stringify(allResults));
            console.log('============= END : queryByStringSWTransmgmt ===========');
            return Buffer.from(JSON.stringify(allResults));
        }
    }
}
/************************************************************************************************
 * 
 * CHAINCODE
 * 
 ************************************************************************************************/

let Chaincode = class {

    /**
     * Initialize the state when the chaincode is either instantiated or upgraded
     * 
     * @param {*} stub 
     */
    async Init(stub) {
        console.log('=========== Init: Instantiated / Upgraded ngo chaincode ===========');
        return shim.success();
    }

    /**
     * The Invoke method will call the methods below based on the method name passed by the calling
     * program.
     * 
     * @param {*} stub 
     */
    async Invoke(stub) {
        console.log('============= START : Invoke ===========');
        let ret = stub.getFunctionAndParameters();
        console.log('##### Invoke args: ' + JSON.stringify(ret));

        let method = this[ret.fcn];
        if (!method) {
            console.error('##### Invoke - error: no chaincode function with name: ' + ret.fcn + ' found');
            throw new Error('No chaincode function with name: ' + ret.fcn + ' found');
        }
        try {
            let response = await method(stub, ret.params);
            console.log('##### Invoke response payload: ' + response);
            return shim.success(response);
        } catch (err) {
            console.log('##### Invoke - error: ' + err);
            return shim.error(err);
        }
    }

    /**
     * Initialize the state. This should be explicitly called if required.
     * 
     * @param {*} stub 
     * @param {*} args 
     */
    async initLedger(stub, args) {
        console.log('============= START : Initialize Ledger ===========');
        console.log('============= END : Initialize Ledger ===========');
    }

    /************************************************************************************************
     * 
     * Self Profile Transactions functions 
     * 
     ************************************************************************************************/

    /**
     * Creates a new Self Profile Transaction
     * 
     * @param {*} stub 
     * @param {*} args - JSON as follows:
     * {
     *   "profileId":"568c28rffc4zbmet100",
     *   "assetType":"Health",
     *   "assetSubType":"PhysicalHealth",
     *   "eventType":"Daily_Check",
     *   "eventValue":true,
     *   "assetReference":"XXXXXXX",
     *   "timestamp":"1611227945000"
     *   }
     */
    async createSWWorklog(stub, args) {
        console.log('============= START :  createSWTransmgmt ===========');
        console.log('#####  createSWTransmgmt arguments: ' + JSON.stringify(args));

        // args is passed as a JSON string
        let json = JSON.parse(args);
        let key = 'SW' + json['profileId'];
        if (json['profileId'] != null && json['profileId'] != undefined) {
            console.log('#####  createSWTransmgmt payload: ' + JSON.stringify(json));
            await stub.putState(key, Buffer.from(JSON.stringify(json)));
            console.log('============= END :  createSWTransmgmt ===========');
        } else {
            throw new Error('##### createSWTransmgmt - profileId must be need create Transcation ');
        }
    }

    /**
     * Retrieves a specfic Self Profile Transaction
     * 
     * @param {*} stub 
     * @param {*} args 
     */
    async queryWorklog(stub, args) {
        console.log('============= START : querySWTransaction ===========');
        console.log('##### querySWTransaction arguments: ' + JSON.stringify(args));

        // args is passed as a JSON string
        let json = JSON.parse(args);
        let key = 'SW' + json['profileId'];
        console.log('##### querySWTransaction key: ' + key);

        return queryByKey(stub, key);
    }
    async queryAllWorklogHist(stub, args) {
        console.log('============= START : queryAllSWTransmgmt ===========');
        console.log('##### queryAllSWTransmgmt arguments: ' + JSON.stringify(args));

        let json = JSON.parse(args);
        let key = 'SW' + json['profileId'];
        let queryString = '{"selector": {"docType":"' + key + '" }}';
        return queryByStringWorklog(stub, queryString);
    }
}
shim.start(new Chaincode());