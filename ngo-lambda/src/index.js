/*
    A generic handler for executing Fabric chaincode functions developed by DARTexon.
*/

'use strict';

const config = require("./config");
const { queryStringHandler, queryArrayHandler, queryObjectHandler } = require("./query");
const invokeHandler = require("./invoke");
const { queryEventsHandler } = require("./queryEvents");
const logger = require("./logging").getLogger("lambdaFunction");


function buildCommonRequestObject(chaincodeFunction, chaincodeFunctionArgs) {
    const argsString = JSON.stringify(chaincodeFunctionArgs);
    const request = {
        chaincodeId: config.chaincodeId,
        fcn: chaincodeFunction,
        args: [argsString],
        chainId: config.channelName,
    };

    return request;
};

/**
 * 
 * @param {*} event (Object)
 * {
 *      functionType: String, one of ['invoke','queryString','queryArray','queryObject']
 *      chaincodeFunction: String, name of the chaincode function to execute
 *      chaincodeFunctionArgs: Object, arguments to pass into the chaincode
 *      fabricUsername: String, username of the context in which to execute the chaincode function
 * }
 *      
 */
async function chaincodeTransactionHandler(event, handlerFunction) {
    let chaincodeFunction = event.chaincodeFunction;
    if (!chaincodeFunction) {
        throw new Error("'chaincodeFunction' must be specified");
    }

    let chaincodeFunctionArgs = event.chaincodeFunctionArgs || {};

    logger.info("=== Handler Function Start ===");

    logger.debug("== Calling chaincodeFunction " + chaincodeFunction + " with chaincodeFunctionArgs ", chaincodeFunctionArgs);

    const request = buildCommonRequestObject(chaincodeFunction, chaincodeFunctionArgs);
    let result = await handlerFunction(request);

    logger.info("=== Handler Function End ===");
    return result;
}

/**
 * 
 * @param {*} event (Object)
 * {
 *      functionType: String, one of ['invoke','queryString','queryArray','queryObject']
 *      chaincodeFunction: String, name of the chaincode function to execute
 *      chaincodeFunctionArgs: Object, arguments to pass into the chaincode
 *      fabricUsername: String, username of the context in which to execute the chaincode function
 * }
 *      
 */

async function handler(event, context, callback) {

    let events = await eventHandler(event);
    let functionType = events.functionType;
    let handlerFunction;

    if (functionType == "queryString") {
        handlerFunction = queryStringHandler;
    } else if (functionType == "queryArray") {
        handlerFunction = queryArrayHandler;
    } else if (functionType == "queryObject") {
        handlerFunction = queryObjectHandler;
    } else if (functionType == "invoke") {
        if (events.chaincodeFunctionArgs.selfProfileId != null && events.chaincodeFunctionArgs.selfProfileId != undefined) {
            handlerFunction = invokeHandler;
        } else {
            throw new Error("SelfProfileId must be need")
        }
    } else if (functionType == "queryEvents") {
        handlerFunction = queryEventsHandler;
    } else {
        throw new Error("functionType must be of type 'queryString', 'queryArray', 'queryObject', 'queryEvents' or 'invoke'");
    }
    try {
        if (functionType == "queryEvents") {
            let result = await handlerFunction(events.transactionId);
            callback(null, result);
        } else {
            let result = await chaincodeTransactionHandler(events, handlerFunction);
            callback(null, result);
        }
    } catch (err) {
        logger.error("Error in Lambda Fabric handler: ", err);
        let returnMessage = err.message || err;
        callback(returnMessage);
    }
};

async function eventHandler(event) {
    let events;
    if (event.Records) {
        for (const { body, eventSourceARN }
            of event.Records) {
            if (eventSourceARN == process.env.identity_SQS_ARN) {
                events = await identityParmsMap(JSON.parse(body))
            } else if (eventSourceARN == process.env.transmgmt_SQS_ARN) {
                events = await transmgmtParamsMap(JSON.parse(body))
            } else {
                throw new Error('Sqs Event Source Not matching')
            }
        }
    } else if (event.functionType) {
        events = event
    }

    config["fabricUsername"] = events.fabricUsername;
    if (events.eventType == "SWIdentity") {
        config["channelName"] = process.env.CHANNEL_NAME_IDENTITY;
        config["chaincodeId"] = process.env.CHAIN_CODE_ID_IDENTITY;
    } else if (events.eventType == "SWTransmgmt") {
        config["channelName"] = process.env.CHANNEL_NAME_TRANSMGMT;
        config["chaincodeId"] = process.env.CHAIN_CODE_ID_TRANSMGMT;
    }
    return events
}

async function identityParmsMap(identityArgs) {
    let identityArgsMap = {
        profileId: identityArgs.selfProfileId ? identityArgs.selfProfileId : null,
        name: identityArgs.name ? identityArgs.name : null,
        email: identityArgs.email ? identityArgs.email : null,
        country: identityArgs.country ? identityArgs.country : null,
        state: identityArgs.state ? identityArgs.state : null,
        County: identityArgs.County ? identityArgs.County : null || identityArgs.county ? identityArgs.county : null,
        authType: identityArgs.authType ? identityArgs.authType : null,
        status: identityArgs.status ? identityArgs.status : null,
        emailVerified: identityArgs.emailVerified ? identityArgs.emailVerified : null,
        authToken: identityArgs.authToken ? identityArgs.authToken : null,
        fcmToken: identityArgs.FCMToken ? identityArgs.FCMToken : null || identityArgs.fcmToken ? identityArgs.fcmToken : null,
        phoneNo: identityArgs.phoneNo ? identityArgs.phoneNo : null,
        RegulatoryZone: identityArgs.RegulatoryZone ? identityArgs.RegulatoryZone : null,
        timestamp: identityArgs.timestamp ? identityArgs.timestamp : null,
        BCTimestamp: new Date(Date.now()).getTime()
    }
    return {
        "functionType": "invoke",
        "chaincodeFunction": "createSWIdentity",
        "chaincodeFunctionArgs": identityArgsMap,
        "fabricUsername": "SWLambdaUser",
        "eventType": "SWIdentity"
    }
}

async function transmgmtParamsMap(transmgmtArgs) {
    let transmgmtArgsMap = {
        profileId: transmgmtArgs.selfProfileId ? transmgmtArgs.selfProfileId : null,
        assetType: transmgmtArgs.assetType ? transmgmtArgs.assetType : null,
        assetSubType: transmgmtArgs.assetSubType ? transmgmtArgs.assetSubType : null,
        eventType: transmgmtArgs.eventType ? transmgmtArgs.eventType : null,
        eventValue: transmgmtArgs.eventValue ? transmgmtArgs.eventValue : null,
        assetReference: transmgmtArgs.assetReference ? transmgmtArgs.assetReference : null,
        latitude: transmgmtArgs.latitude ? transmgmtArgs.latitude : null,
        longitude: transmgmtArgs.longitude ? transmgmtArgs.longitude : null,
        RegulatoryZone: transmgmtArgs.RegulatoryZone ? transmgmtArgs.RegulatoryZone : null,
        timestamp: transmgmtArgs.timestamp ? transmgmtArgs.timestamp : null,
        BCTimestamp: new Date(Date.now()).getTime()
    }
    return {
        "functionType": "invoke",
        "chaincodeFunction": "createSWTransmgmt",
        "chaincodeFunctionArgs": transmgmtArgsMap,
        "fabricUsername": "SWLambdaUser",
        "eventType": "SWTransmgmt"
    }
}

module.exports = { handler };