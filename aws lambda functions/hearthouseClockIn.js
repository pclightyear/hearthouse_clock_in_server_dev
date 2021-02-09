// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const logTableName = "your table name";
const shiftTableName = "your table name";
const snsTopicARN = "your topic arn";

// --------------------------
// End of Filling
// --------------------------

const aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
  region:awsRegion, 
  apiVersion: "2012-08-10",
});

const sns = new aws.SNS({
  region:awsRegion,
  apiVersion: '2010-03-31'
});

const CHANGE_SHIFT_STATUS = {
    "CHANGE_LEAVE": 0,  // 換班的請假者
    "CHANGE_COVER": 1,  // 換班的代班者
    "COVER_LEAVE": 2,    // 代班的請假者
    "COVER_COVER": 3,   // 代班的代班者
    "NORMAL": 4,
}

const CLOCK_IN_STATUS = {
    "ABSENCE": 0,
    "FORGET": 1,
    "LATE": 2,
    "NORMAL": 3
}

exports.handler = async (event) => {
    
  console.log(event);
  let name = event.name || JSON.parse(event).name;
  let ts = Date.now().toString();
  // let ts = event.ts || JSON.parse(event).name || Date.now().toString();
  console.log(`Name: ${name}`)
  console.log(`Ts: ${ts}`)
  
  var tsStart = new Date(parseInt(ts));
  tsStart.setHours(0, 0, 0); // GMT+8 8am
  var tsEnd = new Date(tsStart.getTime());
  tsEnd.setDate(tsEnd.getDate() + 1);
  
  // insert logs to db
  var insert_params = {
    Item: {
     "name": {
        S: name
      }, 
     "ts": {
        N: ts
      }, 
    }, 
    ReturnConsumedCapacity: "TOTAL", 
    TableName: logTableName
  }
  
  var query_params = {
    ExpressionAttributeNames: {
      "#NAME": "name", 
      "#TS": "ts",
      "#CS": "statusChangeShift",
      "#CI": "statusClockIn"
    }, 
    ExpressionAttributeValues: {
    ":name": {
        S: name
      },
      ":tsStart": {
        N: tsStart.getTime().toString()
      },
      ":tsEnd": {
        N: tsEnd.getTime().toString()
      },
      ":cs": {
        N: CHANGE_SHIFT_STATUS.NORMAL.toString()
      },
      ":ci": {
        N: CLOCK_IN_STATUS.ABSENCE.toString()
      }
    }, 
    FilterExpression: "#CS = :cs AND #CI = :ci",
    KeyConditionExpression: "#NAME = :name AND #TS BETWEEN :tsStart AND :tsEnd",
    TableName: shiftTableName
  };

  return dynamodb.putItem(insert_params).promise()
    .then(res => {
        
      return dynamodb.query(query_params).promise()
        .then(res => {
          console.log(res.Items)
          // return returnToApp(true, false, false, name)

          return updateDBStatus(res.Items, name, parseInt(ts));
        })
        .catch(err => {
          printDividingLine("DB scan FAIL")
          console.log(err);
          
          return sendErrToSNS(err, name, ts);
        })
    })
    .catch(err => {
      printDividingLine("DB putItem FAIL")
      console.log(err);
      
      return sendErrToSNS(err, name, ts);
    })
};

function returnToApp(success, isTooEarly, noShift, name) {
  var msg = {
    statusCode: 200,
    success: success,
    isTooEarly: isTooEarly,
    noShift: noShift,
    body: JSON.stringify(`${name} clock in ${success ? "success" : "fail"}`),
  };
  
  console.log(msg)
  
  return msg
}

const PENALTY_MAX = 60 * 60;

function updateDBStatus(shifts, name, clock_in_ts) {
  // 亂打卡
  // TODO
  if (shifts.length == 0) {
    return handleNoShiftUpdate(name);
  }
  
  // console.log(shifts)
  
  var shift_ts = parseInt(shifts[0].ts.N);
  let [statusClockIn, isTooEarly, penalty] = checkLate(clock_in_ts, shift_ts)
  
  let ExprAttrName = {
    "#S": "statusClockIn", 
    "#P": "penalty"
  }
  
  // TODO
  if (isTooEarly) {
    return;
  }
  
  if (shifts[0].checkNextTwoShifts.BOOL) {  // ooo
    // update shifts[0]
    var params1 = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(statusClockIn, (penalty > PENALTY_MAX ? PENALTY_MAX : penalty)),
      Key: getKey(name, shifts[0].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    penalty -= PENALTY_MAX;
    if (penalty < 0) {
      penalty = 0
    }
    
    // update shifts[1]
    var params2 = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(
        (penalty > 0 ? CLOCK_IN_STATUS.LATE : CLOCK_IN_STATUS.NORMAL),
        (penalty > PENALTY_MAX ? PENALTY_MAX : penalty)
        ),
      Key: getKey(name, shifts[1].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    penalty -= PENALTY_MAX;
    
    // update shifts[2]
    var params3 = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(
        (penalty > 0 ? CLOCK_IN_STATUS.LATE : CLOCK_IN_STATUS.NORMAL),
        (penalty > 0 ? penalty : 0)
        ),
      Key: getKey(name, shifts[2].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    var promise1 = dynamodb.updateItem(params1).promise()
    var promise2 = dynamodb.updateItem(params2).promise()
    var promise3 = dynamodb.updateItem(params3).promise()
    
    return Promise.all([promise1, promise2, promise3])
      .then(res => {
        return returnToApp(true, false, false, name)
      })
      .catch(err => {
        printDividingLine("DB updateItem FAIL")
        console.log(err);
      
        return sendErrToSNS(err, name, clock_in_ts);
      })
    
    
  } else if (shifts[0].checkOnlyNextShift.BOOL) { // oo
    // update shifts[0]
    var params1 = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(statusClockIn, (penalty > PENALTY_MAX ? PENALTY_MAX : penalty)),
      Key: getKey(name, shifts[0].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    penalty -= PENALTY_MAX;
    
    // update shifts[1]
    var params2 = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(
        (penalty > 0 ? CLOCK_IN_STATUS.LATE : CLOCK_IN_STATUS.NORMAL),
        (penalty > 0 ? penalty : 0)
        ),
      Key: getKey(name, shifts[1].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    var promise1 = dynamodb.updateItem(params1).promise()
    var promise2 = dynamodb.updateItem(params2).promise()
    
    return Promise.all([promise1, promise2])
      .then(res => {
        return returnToApp(true, false, false, name)
      })
      .catch(err => {
        printDividingLine("DB updateItem FAIL")
        console.log(err);
      
        return sendErrToSNS(err, name, clock_in_ts);
      })
    
  } else {  // o
    var params = {
      ExpressionAttributeNames: ExprAttrName,
      ExpressionAttributeValues: getExprAttrVal(statusClockIn, penalty),
      Key: getKey(name, shifts[0].ts.N), 
      // ReturnValues: "ALL_NEW", 
      TableName: shiftTableName, 
      UpdateExpression: "SET #S = :s, #P = :p"
    };
    
    return dynamodb.updateItem(params).promise()
      .then(res => {
        return returnToApp(true, false, false, name)
      })
      .catch(err => {
        printDividingLine("DB updateItem FAIL")
        console.log(err);
      
        return sendErrToSNS(err, name, clock_in_ts);
      })
  }
  
  function getExprAttrVal(s, p) {
    return {
      ":s": {
        N: s.toString()
      }, 
      ":p": {
        N: p.toString()
      }
    }
  }
  
  function getKey(name, ts) {
    return {
      "name": {
        S: name
      },
      "ts": {
        N: ts.toString()
      }
    }
  }
}

// 在40分鐘前打卡都算有效
// 超過40分鐘會自動忽略，並且reponse給user
// 假如有penalty，會reponse penalty (以秒為單位)
const EARLY_CHECK = -40 * 60;

function checkLate(clock_in_ts, shift_ts) {
  var statusClockIn = CLOCK_IN_STATUS.ABSENCE;
  var isTooEarly = false;
  var penalty = Math.ceil((clock_in_ts - shift_ts) / 1000);
  
  if (penalty < EARLY_CHECK) {
    isTooEarly = true;
  } else if (penalty > 0) {
    statusClockIn = CLOCK_IN_STATUS.LATE;
  } else {
    statusClockIn = CLOCK_IN_STATUS.NORMAL;
  }
  
  if (penalty < 0) {
    penalty = 0;
  }
  
  return [statusClockIn, isTooEarly, penalty]
}

function handleNoShiftUpdate(name) {
  printDividingLine("no shifts available")
  return returnToApp(false, false, true, name)
}

function sendErrToSNS(err, name, ts) {
    printDividingLine("sendErrToSNS")
    var params = {
      Message: `
        後台(AWS)在新增打卡紀錄時出現錯誤，請聯絡打卡系統管理者。
        
        姓名：
        ${name}
        
        打卡時間：
        ${Date(parseInt(ts))}
        
        錯誤訊息：
        ${err}
      `,
      Subject: '[心窩打卡] 新增打卡紀錄異常',
      TopicArn: snsTopicARN
    };
  
    return sns.publish(params).promise()
      .then(res => {
        printDividingLine("send sns success")
        
        return returnToApp(false, false, false, name);
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

function getDividingLineStr(msg) {
  var m = msg || "";
  var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
  var r = LINE_MSG_LENGTH - m.length - l;
  var sign = "-"
  
  return `${sign.repeat(l)}${m}${sign.repeat(r)}\n`
}
