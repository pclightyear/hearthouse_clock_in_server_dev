// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const postTableName = "your table name";
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
    var exprAttrName = {
      "#s_ts": "start_ts", 
      "#e_ts": "end_ts"
    }
    
    var exprAttrValues = {
      ":TS": {
        N: Date.now().toString()
      }
    }
    
    var filterExpr = `#s_ts <= :TS and #e_ts >= :TS`;
    
    var params = {
      ExpressionAttributeNames: exprAttrName,
      ExpressionAttributeValues: exprAttrValues,
      FilterExpression: filterExpr,
      TableName: postTableName
    }
 
  return dynamodb.scan(params).promise()
    .then(res => {
      var posts = processItems(res.Items)
      
      const response = {
        statusCode: 200,
        success: true,
        posts: posts
      };
      
      return response;
    })
    .catch(err => {
      printDividingLine("Get Bulletin Post Error");
      console.log(err);

      return sendErrToSNS(err);
    })
};

// {
//   "ts": { "N": num },
//   "author": { "S": str },
//   "title": { "S": str },
//   "content": { "S": str },
//   "start_ts": { "N": num },
//   "end_ts": { "N": num }
// }

function processItems(items) {
  var posts = [];
  var i;
  
  for (i = 0; i < items.length; i++) {
    posts.push({
      "ts": items[i].ts.N,
      "author": items[i].author.S,
      "title": items[i].title.S,
      "content": items[i].content.S,
      "start_ts": items[i].start_ts.N,
      "end_ts": items[i].end_ts.N
    })
  }
  
  return posts
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