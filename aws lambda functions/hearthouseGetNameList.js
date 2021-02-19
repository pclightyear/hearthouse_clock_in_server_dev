// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const nameTableName = "your table name";
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
    var params = {
      TableName: nameTableName
    }
 
  return dynamodb.scan(params).promise()
    .then(res => {
      var items = res.Items;
      var nameList = [];
      
      items.forEach(item => {
        nameList.push(item.name.S)
      })
      
      const response = {
        statusCode: 200,
        success: true,
        nameList: nameList
      };
      
      return response;
    })
    .catch(err => {
      printDividingLine("Get Bulletin Post Error");
      console.log(err);

      return sendErrToSNS(err);
    })
};

function sendErrToSNS(err) {
  printDividingLine("sendErrToSNS")
  var params = {
    Message: `
      後台(AWS)在讀取公告欄貼文時出現錯誤，請聯絡打卡系統管理者。
      
      時間：
      ${Date.now()}
      
      錯誤訊息：
      ${err}
    `,
    Subject: '[心窩打卡] 讀取公告欄貼文異常 (Dev)',
    TopicArn: snsTopicARN
  };

  return sns.publish(params).promise()
    .then(res => {
      printDividingLine("send sns success")
      
      const response = {
        statusCode: 200,
        success: false,
      };
      
      return response;
    })
    .catch(err => {
      printDividingLine("send sns error")
      console.log(err)
      printDividingLine()
      
      return sendErrToSNS();
    });
};

var LINE_MSG_LENGTH = 50;

function printDividingLine(msg) {
  var m = msg || "";
  var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
  var r = LINE_MSG_LENGTH - m.length - l;
  var sign = "-"
  
  console.log(`${sign.repeat(l)}${m}${sign.repeat(r)}`)
};