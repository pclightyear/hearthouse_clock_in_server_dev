// --------------------------
// Fill in the necessary info
// --------------------------

var awsRegion = 'your aws region'; // e.g. 'us-east-1'

// --------------------------
// End of Filling
// --------------------------

var aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
    region: awsRegion, 
    apiVersion: "2012-08-10",
});

exports.handler = async (event) => {
    
    var requests = event.requests || JSON.parse(event).requests;
    var errorMsg = event.errorMsg || JSON.parse(event).errorMsg;
    console.log(errorMsg)
    console.log(requests.RequestItems.HeartHouseClockInShifts);
 
    var res;
 
    try {
        res = await dynamodb.batchWriteItem(requests).promise();
        console.log(res);  // successful response
            
        const response = {
            statusCode: 200,
            success: true,
            body: JSON.stringify(`add shifts and checkpoint success`),
        };
        
        return response;
    }
    catch (err) {
        console.log(err, err.stack); // an error occurred
        console.log(errorMsg)
            
        const response = {
            statusCode: 200,
            success: false,
            body: errorMsg,
        };
        
        return response;
    }
};
