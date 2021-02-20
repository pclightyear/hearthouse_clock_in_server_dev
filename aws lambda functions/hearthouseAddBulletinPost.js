// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const postTableName = "your table name";
const snsTopicARN = "your topic arn";

// --------------------------
// End of Filling
// --------------------------

// {
//     ts: 0
//     author: 1
//     title: 2
//     content: 3
//     start_date: 4
//     end_date: 5
// }

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
    
    let ts = Date.now().toString();
    let [author, title, content, start_ts, end_ts] = processEntry(entry);
    console.log(author);
    console.log(title);
    console.log(content);
    console.log(start_ts);
    console.log(end_ts);
    
    var params = {
      Item: {
        "ts": {
          N: ts
        },
        "author": {
          S: author
        },
        "title": {
          S: title
        },
        "content": {
          S: content
        },
        "start_ts": {
          N: start_ts
        },
        "end_ts": {
          N: end_ts
        }
          
      }, 
      ReturnConsumedCapacity: "TOTAL", 
      TableName: postTableName
    }
 
  return dynamodb.putItem(params).promise()
    .then(res => {
      const response = {
        statusCode: 200,
        success: true,
        body: JSON.stringify(`add post success`),
      };
      
      return response;
    })
    .catch(err => {
      printDividingLine("Add Bulletin Post Error");
      console.log(err);

      return sendErrToSNS(err, author, ts);
    })
};

function processEntry(entry) {
  var author = entry[1];
  var title = entry[2]
  var content = entry[3];
  var start_ts = dateToTS(entry[4], false);
  var end_ts = dateToTS(entry[5], true);
  
  return [author, title, content, start_ts, end_ts];
}

function dateToTS(date, add_one) {
  let [yyyy, mm, dd] = date.split('/');
  var d = new Date(yyyy, mm-1, dd);
  
  if (add_one) {
    d.setDate(d.getDate() + 1);
  }
  
  return d.getTime().toString();
}

function sendErrToSNS(err, author, ts) {
  printDividingLine("sendErrToSNS")
  var params = {
    Message: `
      後台(AWS)在新增公告欄貼文時出現錯誤，請聯絡打卡系統管理者。
      
      作者：
      ${author}
      
      時間：
      ${Date(parseInt(ts))}
      
      錯誤訊息：
      ${err}
    `,
    Subject: '[心窩打卡] 新增公告欄貼文異常 (Dev)',
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