// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const bgTableName = "HeartHouseFrontEndBackgroundImage";
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

exports.handler = async (event) => {
    
  var entry = event.data || JSON.parse(event.body).data;
  console.log(entry);
  
  var ts = Date.now();
  var requests = []
  
  entry.forEach(url => {
    requests.push({
      "PutRequest": {
        "Item": {
          "dummy_id": {"N": "1"},
          "ts": {"N": ts.toString()},
          "url": {"S": url},
          "start_ts": {"N": "-1"}, // image not used
          "end_ts": {"N": "-1"} // image not used
        }
      }
    })
    
    ts = ts + 1;
  })
  
  var writeParams = {
    "RequestItems": {
      [bgTableName]: requests
    }
  }

  return dynamodb.batchWriteItem(writeParams).promise()
    .then(res => {
      const response = {
        statusCode: 200,
        success: true,
        body: JSON.stringify(`Add fontend bg post success`),
      };
    
      return response;
    })
    .catch(err => {
      printDividingLine("Add fontend bg Error");
      console.log(err);

      return sendErrToSNS(err, ts);
    })
};

function sendErrToSNS(err, ts) {
  printDividingLine("sendErrToSNS")
  var params = {
    Message: `
      後台(AWS)在新增前台背景圖時出現錯誤，請聯絡打卡系統管理者。
      
      時間：
      ${Date(parseInt(ts))}
      
      錯誤訊息：
      ${err}
    `,
    Subject: '[心窩打卡] 新增前台背景圖異常',
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