// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const shiftTableName = "HeartHouseClockInShifts";
const snsTopicARN = "your topic arn";

// --------------------------
// End of Filling
// --------------------------

const aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
  region: awsRegion, 
  apiVersion: "2012-08-10",
});

const sns = new aws.SNS({
  region: awsRegion,
  apiVersion: '2010-03-31'
});

const LAMBDA_TYPE = {
  "AWS_FAIL": 0,
  "SUCCESS": 1,
}

const CHANGE_SHIFT_STATUS = {
  "CHANGE_LEAVE": 0,  // 換班的請假者
  "CHANGE_COVER": 1,  // 換班的代班者
  "COVER_LEAVE": 2,    // 代班的請假者
  "COVER_COVER": 3,   // 代班的代班者
  "NORMAL": 4,
}

exports.handler = async (event) => {
  var [mm, dd, yyyy] = ( new Date() ).toLocaleDateString().split("/");
  var startDate = new Date(yyyy, mm-1, dd);
  startDate.setMonth(startDate.getMonth() - 1);
  
  var endDate = new Date(yyyy, mm-1, dd);
  endDate.setDate(endDate.getDate() - 1);
  
  console.log(startDate)
  console.log(endDate)
  
  var params = {
    ExpressionAttributeNames: {
      "#ts": "ts",
      "#name": "name",
      "#p": "penalty",
      "#CS": "statusChangeShift",
      "#CI": "statusClockIn"
    }, 
    ExpressionAttributeValues: {
      ":startTs": {
        N: startDate.getTime().toString()
      },
      ":endTs": {
        N: endDate.getTime().toString()
      }
    }, 
    FilterExpression: `#ts >= :startTs and #ts <= :endTs`, 
    ProjectionExpression: "#name, #p, #CS, #CI",
    TableName: shiftTableName
  };
  
  try {
    var res = await dynamodb.scan(params).promise();
    var shiftList = res.Items;
    
    if (!shiftList) {
      printDividingLine("dynamodb SCAN EMPTY RESPONSE")
      return sendToSNS(LAMBDA_TYPE.AWS_FAIL, "dynamodb SCAN EMPTY RESPONSE");
    }
    
    var champ = getRank(shiftList);
    var m = "";
    
    console.log(champ)
    
    champ.forEach(c => {
      if (c[1] > 0) {
        m += `
          本月遲到王：${c[0]}
          penalty：${Math.ceil(c[1]/60)}
        `
      }
    })
    
    if (champ[0][1] == 0) {
      var msg = `
        月次：${startDate.getFullYear()}/${startDate.getMonth()+1}
        本月無人遲到。
      `
    } else {
      var msg = `
        月次：${startDate.getFullYear()}/${startDate.getMonth()+1}
        ${m}
      `
    }

    console.log(msg);
    
    return sendToSNS(LAMBDA_TYPE.SUCCESS, msg)
    
  } catch(err) {
    printDividingLine("dynamodb SCAN ERROR")
    console.log(err)
    
    return sendToSNS(LAMBDA_TYPE.AWS_FAIL, err);
  }
};

function getRank(arr) {
  var statistics = {}
  
  arr.forEach(s => {
    var name = s.name.S;
    var statusChangeShift = parseInt(s.statusChangeShift.N);
    var penalty = parseInt(s.penalty.N);

    if (statusChangeShift == CHANGE_SHIFT_STATUS.NORMAL) {
      if (!statistics[name]) {
        statistics[name] = 0;
      }
      statistics[name] += penalty;
    }
  })
  
  var sortedStatistics = getSortedDict(statistics);
  
  return sortedStatistics.slice(0, 3);
}

function getSortedDict(dict) {
    // Create items array
    var items = Object.keys(dict).map(function(key) {
        return [key, dict[key]];
    });
    
    // Sort the array based on the second element
    items.sort(function(first, second) {
        return second[1] - first[1];
    });

    return items;
}

function generateSNSMsg(type, msg) {
  switch(type) {
    case LAMBDA_TYPE.AWS_FAIL:
      return {
        msg: `
        錯誤訊息：
        ${msg}
        `,
        subject: '[心窩打卡] 每月遲到統計異常'
      }
    case LAMBDA_TYPE.SUCCESS:
      return {
        msg: msg,
        subject: '[心窩打卡] 每月遲到統計'
      }  
  }
}

function sendToSNS(type, m) {
  printDividingLine("sendToSNS");
  var {msg, subject} = generateSNSMsg(type, m);
  
  var params = {
    Message: msg,
    Subject: subject,
    TopicArn: snsTopicARN
  };
  
  return sns.publish(params).promise()
    .then(res => {
      printDividingLine("send sns success")
      
      return {
        statusCode: 200,
        success: true,
        body: "generate weekly report success",
      }
    })
    .catch(err => {
      printDividingLine("send sns error")
      console.log(err)
      printDividingLine()
      
      return sendToSNS(LAMBDA_TYPE.AWS_FAIL, msg)
    })
}

var LINE_MSG_LENGTH = 75;

function printDividingLine(msg) {
  var m = msg || "";
  var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
  var r = LINE_MSG_LENGTH - m.length - l;
  var sign = "-"
  
  console.log(`${sign.repeat(l)}${m}${sign.repeat(r)}`)
}

function getDividingLineStr(msg) {
  var m = msg || "";
  var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
  var r = LINE_MSG_LENGTH - m.length - l;
  var sign = "-"
  
  return `${sign.repeat(l)}${m}${sign.repeat(r)}\n`
}