// --------------------------
// Fill in the necessary info
// --------------------------

var awsRegion = 'your aws region'; // e.g. 'us-east-1'
var nameTableName = 'your table name';
const snsTopicARN = "your topic arn";

// --------------------------
// End of Filling
// --------------------------

var aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
    region: awsRegion, 
    apiVersion: "2012-08-10",
});

exports.handler = async (event) => {
    
    var nameList = event.nameList || JSON.parse(event).nameList;
    console.log("Name List:")
    console.log(nameList);
    
    var scan_params = {
        TableName: nameTableName
    };
    
    return dynamodb.scan(scan_params).promise()
        .then(res => {
            return deleteDBItems(res, nameList)
        })
        .catch(err => {
            console.log(err, err.stack); // an error occurred
            return responseToGUI(false, "DB scan error");
        })
};

var CHUNK_SIZE = 25;
var chunks = 0;
var finish_chunks = 0;
var success_chunks = 0;

async function deleteDBItems(items, nameList) {
    var itemList = items.Items;
    console.log("Delete Items:")
    console.log(itemList.length)
    console.log(itemList);
    
    if (itemList.length == 0) {
        const promise = new Promise((resolve, reject) => {
            insertDBItems(nameList)
        })
        
        return promise;
    }
    
    // batch delete
    var requests = []
    
    itemList.forEach(item => {
        var name = item.name.S;

        requests.push({
            "DeleteRequest": {
                "Key": {
                    "name": {"S": name},
                }
            }
        })
    })
    
    var chunk_requests = [];
    var promises = [];
    var i;
    
    for (i = 0; i < requests.length; i += CHUNK_SIZE) {
        chunk_requests.push(requests.slice(i, i+CHUNK_SIZE))
    }
    
    chunks = chunk_requests.length
    finish_chunks = 0;
    success_chunks = 0;
    
    chunk_requests.forEach((requests, i) => {
        var requests_params = {
            "RequestItems": {
                [nameTableName]: requests
            }
        }
        
        promises.push(dynamodb.batchWriteItem(requests_params).promise()
            .then(data => {
                finish_chunks += 1;
                success_chunks += 1;
            })
            .catch(err => {
                finish_chunks += 1;
                console.log(err, err.stack); // an error occurred
                return responseToGUI(false, "DB insert error");
            })
        )
    })
    
    return Promise.all(promises)
        .then(res => {
            console.log("Delete promise all processed")
            return checkIfDeleteNameAllProcessed()
        })
        .catch(err => {
            console.log(err, err.stack)
            return responseToGUI(false, "DB delete error")
        })
    
    function checkIfDeleteNameAllProcessed() {
        console.log("checkIfDeleteNameAllProcessed")
        // console.log(finish_chunks)
        // console.log(success_chunks)
        if (finish_chunks == chunks) {
            if (success_chunks == finish_chunks) {
                console.log("DB delete item success");
                return insertDBItems(nameList);
            }
        }
            
        return responseToGUI(false, "DB delete items error");
    }   
}

async function insertDBItems(nameList) {
    var requests = []
    
    // batch insert
    var requests = []
    
    nameList.forEach(name => {
        requests.push({
            "PutRequest": {
                "Item": {
                    "name": {"S": name},
                }
            }
        })
    })
    
    var chunk_requests = [];
    var promises = [];
    var i;
    
    for (i = 0; i < requests.length; i += CHUNK_SIZE) {
        chunk_requests.push(requests.slice(i, i+CHUNK_SIZE))
    }
    
    chunks = chunk_requests.length
    finish_chunks = 0;
    success_chunks = 0;
    
    chunk_requests.forEach((requests, i) => {
        var requests_params = {
            "RequestItems": {
                [nameTableName]: requests
            }
        }
    
        promises.push(dynamodb.batchWriteItem(requests_params).promise()
            .then(data => {
                finish_chunks += 1;
                success_chunks += 1;
            })
            .catch(err => {
                finish_chunks += 1;
                console.log(err, err.stack); // an error occurred
                return responseToGUI(false, "DB insert error");
            })
        )
    })
    
    return Promise.all(promises)
        .then(res => {
            console.log("Insert promise all processed")
            return checkIfAddNameAllProcessed()
        })
        .catch(err => {
            console.log(err, err.stack)
            return responseToGUI(false, "DB insert error")
        })
        
    function checkIfAddNameAllProcessed() {
        console.log("checkIfAddNameAllProcessed")
        // console.log(finish_chunks)
        // console.log(success_chunks)
        if (finish_chunks == chunks) {
            if (success_chunks == finish_chunks) {
                console.log("DB insert item success")
                return responseToGUI(true, "DB update name success");
            }
        }
        return responseToGUI(false, "DB insert error");
    }
}

function responseToGUI(success, msg) {
    console.log("response")
    
    const response = {
        statusCode: 200,
        success: success,
        body: msg
    };
    
    console.log(response)
    
    return response;
}