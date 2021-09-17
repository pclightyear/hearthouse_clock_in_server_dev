// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const tableName = "HeartHouseFrontEndBackgroundImage";
const snsTopicARN = "your topic arn";

// --------------------------
// End of Filling
// --------------------------

var aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
  region: awsRegion, 
  apiVersion: "2012-08-10",
});

const sns = new aws.SNS({
  region:awsRegion,
  apiVersion: '2010-03-31'
});

// each image have one week life time
var LIFETIME = 7 * 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  
  var return_url = "none";
  var exprAttrNames = {
    "#end": "end_ts"
  }
  var exprAttrValues = {
    ":not_set": {
      N: "-1"
    }
  }
  var filterExpr = "#end = :not_set"
  
  var scanParams = {
    ExpressionAttributeNames: exprAttrNames,
    ExpressionAttributeValues: exprAttrValues,
    FilterExpression: filterExpr, 
    TableName: tableName
  };
  
  return dynamodb.scan(scanParams).promise()
    .then(res => {
      res.Items.forEach(e => console.log(e))
      
      var urls = res.Items;
      var update_requests = [];
      
      const response = {
        statusCode: 200,
        success: true,
        body: JSON.stringify(`Send fontend bg success`),
        url: return_url
      };
      
      // not bg available
      if (urls.length == 0) {
        return response;
      }
      
      var candidate = urls[0];
      var candidate_start_ts = parseInt(candidate.start_ts.N);
      var candidate_url = candidate.url.S;
      
      var cur_ts = Date.now();
      
      // no previous set bg
      if (candidate.start_ts.N == '-1') {
        console.log("no previous set bg");
        // set return_url to candidate
        return_url = candidate_url;
        
        // TODO: append an update item request
        update_requests.push({
          ExpressionAttributeNames: {
            "#start": "start_ts"
          }, 
          ExpressionAttributeValues: {
            ":cur_ts": {
              N: cur_ts.toString()
            }
          }, 
          Key: {
           "dummy_id": candidate.dummy_id, 
           "ts": candidate.ts
          }, 
          TableName: tableName, 
          UpdateExpression: "SET #start = :cur_ts"
        })
      }
      
      // check if previous bg is expired
      else {
        console.log("check if previous bg is expired");

        // bg not expired
        console.log()
        if (cur_ts - candidate_start_ts < LIFETIME) {
          return_url = candidate_url;
        }
        // bg expired
        else {
          // append update item request
          update_requests.push({
            ExpressionAttributeNames: {
              "#end": "end_ts"
            }, 
            ExpressionAttributeValues: {
              ":cur_ts": {
                N: cur_ts.toString()
              }
            }, 
            Key: {
             "dummy_id": candidate.dummy_id, 
             "ts": candidate.ts
            }, 
            TableName: tableName, 
            UpdateExpression: "SET #end = :cur_ts"
          })
          
          // find if there is next bg
          candidate = urls[1];
          
          // no next candidate, use default bg
          if (candidate) {
            return_url = candidate.url.S;
            // append an update item request
            update_requests.push({
              ExpressionAttributeNames: {
                "#start": "start_ts"
              }, 
              ExpressionAttributeValues: {
                ":cur_ts": {
                  N: cur_ts.toString()
                }
              }, 
              Key: {
               "dummy_id": candidate.dummy_id, 
               "ts": candidate.ts
              }, 
              TableName: tableName, 
              UpdateExpression: "SET #start = :cur_ts"
            })
          }
        }
      }
      
      response.url = return_url;
      
      if (update_requests.length == 0) {
        return response;
      } 
      
      // handle DB update
      var update_requests_promises = []
      update_requests.forEach(r => {
        var promise = dynamodb.updateItem(r).promise()
          .then(res => {
            printDividingLine("Update Item success");
            console.log(r);
            printDividingLine();
          })

        update_requests_promises.push(promise);
      })
      
      return Promise.all(update_requests_promises)
        .then(res => {
          return response;
        })
    })
    .catch(err => {
      printDividingLine("Send fontend bg Error");
      console.log(err);

      return sendErrToSNS(err, Date.now());
    })
};

function sendErrToSNS(err, ts) {
  printDividingLine("sendErrToSNS")
  var params = {
    Message: `
      後台(AWS)在更新前台背景圖時出現錯誤，請聯絡打卡系統管理者。
      
      時間：
      ${Date(parseInt(ts))}
      
      錯誤訊息：
      ${err}
    `,
    Subject: '[心窩打卡] 更新前台背景圖異常',
    TopicArn: snsTopicARN
  };

  return sns.publish(params).promise()
    .then(res => {
      printDividingLine("send sns success")
      
      return;
    })
    .catch(err => {
      printDividingLine("send sns error")
      console.log(err)
      printDividingLine()
      
      return sendErrToSNS();
    });
}

var LINE_MSG_LENGTH = 50;

function printDividingLine(msg) {
  var m = msg || "";
  var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
  var r = LINE_MSG_LENGTH - m.length - l;
  var sign = "-"
  
  console.log(`${sign.repeat(l)}${m}${sign.repeat(r)}`)
}