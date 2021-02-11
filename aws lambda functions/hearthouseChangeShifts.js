// {
// 	"時間戳記": 0,     
// 	"換班 or 代班?": 1,
// 	"請假事由": 2,         
// 	"請假人": 3,
// 	"換/代班人": 4,   
// 	"請假日期1": 5,
// 	"請假時段1": 6,    
// 	"請假日期2": 7,
// 	"請假時段2": 8,    
// 	"請假日期3": 9,
// 	"請假時段3": 10,    
// 	"換班日期1": 11,
// 	"換班時段1": 12, 
// 	"換班日期2": 13,
// 	"換班時段2": 14, 
// 	"換班時段3": 15,
// 	"換班日期3": 16
//  "補班日期1": 17,
//  "補班時段1": 18,
//  "補班日期2": 19,
//  "補班時段2": 20,
//  "補班日期3": 21,
//  "補班時段3": 22,
//  "請問你確定要送出請假表單了嗎?": 23
// }

// --------------------------
// Fill in the necessary info
// --------------------------

const awsRegion = 'your aws region'; // e.g. 'us-east-1'
const changeShiftLogtableName = "your table name";
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

const shiftCntNotSameErr = "請假班表 與 代/換班表 數量不一樣";
const changeShiftErr = "換班班表有誤";
const leaveShiftsNotFoundErr = "請假班表不存在";
const coverShiftsNotFoundErr = "換班班表不存在";

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

const LAMBDA_ERROR_TYPE = {
    "AWS_FAIL": 0,
    "GOOGLE_FORM_FAIL": 1,
    "FORM_ERROR": 2,
}

var metadata = [
	"時間戳記", 
	"換班 or 代班?",
	"請假事由",
	"請假人",
	"換/代班人",   
	"請假日期1",
	"請假時段1",
	"請假日期2",
	"請假時段2",    
	"請假日期3",
	"請假時段3",    
	"換班日期1",
	"換班時段1", 
	"換班日期2",
	"換班時段2", 
	"換班時段3",
	"換班日期3",
  "補班日期1",
  "補班時段1",
  "補班日期2",
  "補班時段2",
  "補班日期3",
  "補班時段3",
  "請問你確定要送出請假表單了嗎?"
]

const CHINESE_WEEKDAY_TO_NUM = {
  "週一": 1,
  "周一": 1,
  "一": 1,
  "週二": 2,
  "周二": 2,
  "二": 2,
  "週三": 3,
  "周三": 3,
  "三": 3,
  "週四": 4,
  "周四": 4,
  "四": 4,
  "週五": 5,
  "周五": 5,
  "五": 5,
}

const SHIFT_STR_TO_IDX = {
  "8:50-10:00": 0,
  "10:00-11:00": 1,
  "11:00-12:00": 2,
  "12:00-13:10": 3,
  "13:10-14:10": 4,
  "14:10-15:20": 5,
  "15:20-16:20": 6,
  "16:20-17:20": 7,
  "17:20-18:20": 8,
  "18:20-19:20": 9,
  "19:20-20:20": 10,
  "20:20-21:20": 11
}

const PENALTY = "3600"

var metadata;

exports.handler = async (event) => {
  console.log("hearthouseChangeShifts");

  var entry = event.data || JSON.parse(event.body).data;
  console.log(entry);

  let [leaveShifts, coverShifts, makeupShifts] = processPeriods(entry);

  return checkAllShifts(entry, leaveShifts, coverShifts)
    .then(res => {
      printDividingLine("checkAllShifts success");
      
      return changeShiftDBstate(res, res.entry, makeupShifts)
        .then(res => {
          // 新增 log 至 HeartHouseChangeShiftLogs
          return addLogToChangeShiftDB(res.entry, true)
            .then(res => {
              printDividingLine("UPDATE ALL SUCCESS")
              printDividingLine(Date().toString())
              return {
                statusCode: 200,
                success: true,
                body: "更新代/換班狀態",
              };
            })
            .catch(err => {
              var errMsg = 
                getDividingLineStr("ADD CHANGE SHIFT FAIL") + 
                err.toString() +
                getDividingLineStr();
                
              console.log(errMsg)
    
              return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg)
            })
        })
        .catch(err => {
          var errMsg = 
            getDividingLineStr("CHANGE SHIFT FAIL") + 
            err.toString() +
            getDividingLineStr();
          
          printDividingLine()
          console.log(errMsg)
          printDividingLine()

          return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg)
        })
      
    })
    .catch(err => {
      var errMsg = 
        getDividingLineStr("checkAllShifts FAIL") + 
        err.msg.toString() + '\n' + 
        getDividingLineStr();
      console.log(errMsg);
        
      return addLogToChangeShiftDB(err.entry, false, errMsg);
    })
};

function processPeriods(entry) {
  var leavePeriods = [];
  var coverPeriods = [];
  var makeupPeriods = [];
  
  leavePeriods.push(processDate(entry[5], entry[6]))
  leavePeriods.push(processDate(entry[7], entry[8]))
  leavePeriods.push(processDate(entry[9], entry[10]))
  
  coverPeriods.push(processDate(entry[11], entry[12]))
  coverPeriods.push(processDate(entry[13], entry[14]))
  coverPeriods.push(processDate(entry[15], entry[16]))
  
  makeupPeriods.push(processMakeupDate(entry[17], entry[18]))
  makeupPeriods.push(processMakeupDate(entry[19], entry[20]))
  makeupPeriods.push(processMakeupDate(entry[21], entry[22]))
  
  leavePeriods = leavePeriods.filter(Boolean);
  coverPeriods = coverPeriods.filter(Boolean);
  makeupPeriods = makeupPeriods.filter(Boolean);
  
  return [leavePeriods, coverPeriods, makeupPeriods];
}

function processDate(day, time) {
  // day: 2020/8/8
  // time: 08:50-10:00
  if (day == '' || time == '') {
    return;
  }
  
  let [yyyy, mm, dd] = day.split('/');
  var startTime = time.split('-');
  let [hh, min] = startTime[0].split(':');
  
  var d = new Date(yyyy, mm-1, dd, hh, min, 0);
  d.setHours(d.getHours() - 8);
  
  return d.getTime().toString();
}

function processMakeupDate(day, time) {
  // day: 2020/8/8
  // time: 週一 08:50-10:00
  if (!day || !time) {
    return;
  }
  
  let [yyyy, mm, dd] = day.split('/');
  var timeSplit = time.split(' ');
  let weekday = CHINESE_WEEKDAY_TO_NUM[timeSplit[0]];
  var startTime = timeSplit[1].split('-');
  let [hh, min] = startTime[0].split(':');
  
  var d = new Date(yyyy, mm-1, dd, hh, min, 0);
  
  if (d.getDay() != weekday) {
    return;
  }
   
  // UTC+8 -> UTC+0
  d.setHours(d.getHours() - 8);
  
  return d.getTime().toString();
}

// 檢查是否可以換班 (DB內要有資料)
function checkAllShifts(entry, leaveShifts, coverShifts) {
  printDividingLine("checkAllShifts")
  
  // printDividingLine(leaveShifts)
  // printDividingLine(coverShifts)
  
  const checkLeavePromise = new Promise((resolve, reject) => {
    checkShift(entry[3], leaveShifts) // 請假人
      .then(res => {
        resolve({
          "leaveShiftItems": res
        })
      })
      .catch(err => {
        printDividingLine("checkLeavePromise ERROR")
        console.log(err)
        printDividingLine()
        
        reject({
          msg: leaveShiftsNotFoundErr,
          entry: entry
        });
      });
  })
  
  const checkCoverPromise = new Promise((resolve, reject) => {
    checkShift(entry[4], coverShifts) // 換/代班人
      .then(res => {
        resolve({
          "coverShiftItems": res
        })
      })
      .catch(err => {
        printDividingLine("checkCoverPromise ERROR")
        console.log(err)
        printDividingLine()
        
        reject({
          msg: leaveShiftsNotFoundErr,
          entry: entry
        })
      });
  })
  
  return Promise.all([checkLeavePromise, checkCoverPromise])
    .then(values => {
      var res = {...values[0], ...values[1]};
      res.entry = entry;

      if (leaveShifts.length != res.leaveShiftItems.length) {
        throw {
          msg: shiftCntNotSameErr,
          entry: entry
        };
      }
      
      
      if ((entry[1] == "換班")) { // 換班 or 代班?
        if (res.leaveShiftItems.length != res.coverShiftItems.length) {
          throw {
            msg: changeShiftErr,
            entry: entry
          };
        }
      }

      return res;
    })
}

function checkShift(person, shifts) {
  if (shifts.length == 0) {
    return new Promise((resolve, reject) => {
      resolve([])
    });
  }
  
  var exprAttrNames = {
    "#name": "name",
    "#ts": "ts",
    "#status": "statusChangeShift"
  }
  
  var exprAttrValues = {
    ":N": {
      S: person
    }, 
    ":NORMAL": {
      N: CHANGE_SHIFT_STATUS.NORMAL.toString()
    }
  }
  
  var filterExpr = "";
  
  if (shifts.length >= 1) {
    exprAttrValues[':ts1'] = {
      N: shifts[0].toString()
    }
    
    filterExpr += "#name = :N and #ts = :ts1 and #status = :NORMAL"
  }
  
  if (shifts.length >= 2) {
    exprAttrValues[':ts2'] = {
      N: shifts[1].toString()
    }
    
    filterExpr += " or #name = :N and #ts = :ts2 and #status = :NORMAL"
  }
  
  if (shifts.length == 3) {
    exprAttrValues[':ts3'] = {
      N: shifts[2].toString()
    }
    filterExpr += " or #name = :N and #ts = :ts3 and #status = :NORMAL"
  }
  
  var params = {
    ExpressionAttributeNames: exprAttrNames,
    ExpressionAttributeValues: exprAttrValues,
    FilterExpression: filterExpr, 
    TableName: shiftTableName
  };
  
  return dynamodb.scan(params).promise()
    .then(res => {
      return res.Items
    })
}

function changeShiftDBstate(res, entry, makeupShifts) {
  var leaveShiftItems = res.leaveShiftItems;
  var coverShiftItems = res.coverShiftItems;
  var requests_items = [];

  var status = entry[1]; // 換班 or 代班?

  var leaveName = {
    S: entry[3] // 請假人
  };
  
  var coverName = {
    S: entry[4] // 換(代)班人 
  }  
  
  if (status == "換班") {
    // 更改雙方班表的狀態
    leaveShiftItems.forEach(item => {
      item['statusChangeShift'] = {"N": CHANGE_SHIFT_STATUS.CHANGE_LEAVE.toString()}
      requests_items.push(item)
    })
    
    coverShiftItems.forEach(item => {
      item['statusChangeShift'] = {"N": CHANGE_SHIFT_STATUS.CHANGE_COVER.toString()}
      requests_items.push(item)
    })
    
    // 新增雙方的班表
    leaveShiftItems.forEach(item => {
      requests_items.push({
        "name": coverName,
        "ts": item.ts,
        "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
        "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
        "penalty": {"N": PENALTY}
      })
    })
    
    coverShiftItems.forEach(item => {
      requests_items.push({
        "name": leaveName,
        "ts": item.ts,
        "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
        "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
        "penalty": {"N": PENALTY}
      })
    })
    
  } else if (status == "代班") {
    // 更改請假者班表的狀態
    leaveShiftItems.forEach(item => {
      item['statusChangeShift'] = {"N": CHANGE_SHIFT_STATUS.COVER_LEAVE.toString()}
      requests_items.push(item)
    })
    
    // 新增代班的班表
    leaveShiftItems.forEach(item => {
      requests_items.push({
        "name": coverName,
        "ts": item.ts,
        "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
        "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
        "penalty": {"N": PENALTY}
      })
    })
  
    // 新增補班的班表
    makeupShifts.forEach((ts, i) => {
      requests_items.push({
        "name": leaveName,
        "ts": { "N": ts },
        "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
        "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
        "penalty": {"N": PENALTY}
      })
    })
  }
  
  // console.log(requests_items);
  
  var requests = [];
  requests_items.forEach(item => {
    requests.push({
      "PutRequest": { "Item": item }
    })
  })

  var params = {
    "RequestItems": {
      [shiftTableName]: requests
    }
  }
  
  return dynamodb.batchWriteItem(params).promise()
    .then(res => {
      res.entry = entry;
      return res;
    })
}

function addLogToChangeShiftDB(entry, success, errMsg) {
  printDividingLine("addLogToChangeShiftDB");
  
  var item = {
    "ts": {
      N: Date.now().toString()
    },
    "success": {
      BOOL: success
    }
  };
  
  entry.forEach((e, i) => {
    var colName = metadata[i]
    item[colName] = { S: e }
  })
  
  var params = {
    Item: item,
    TableName: changeShiftLogtableName
  }
  
  return dynamodb.putItem(params).promise()
    .then(res => {
      printDividingLine("add to DB success");
      if (!success) {
        return sendErrToSNS(LAMBDA_ERROR_TYPE.FORM_ERROR, errMsg, entry);
      }
    })
    .catch(err => {
      var errMsg = 
        getDividingLineStr("add to DB fail") +
        err.toString() + '\n' +
        getDividingLineStr();
        
      return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg, entry);
    })
}

function generateSNSErrMsg(type, errMsg, entry) {
  var infoMsg = `
    
    錯誤訊息：
    ${errMsg}
    
    表單紀錄：
    ${entry}

    `
  switch (type) {
    case LAMBDA_ERROR_TYPE.AWS_FAIL:
      return `後台(AWS)在更新班表時出現錯誤，請聯絡打卡系統管理者。${infoMsg}`

    case LAMBDA_ERROR_TYPE.GOOGLE_FORM_FAIL:
      return `無法讀取後台(GOOGLE FORM)資料，請聯絡打卡系統管理者。${infoMsg}`
        
    case LAMBDA_ERROR_TYPE.FORM_ERROR:
      return `表單填寫資訊有誤，請聯絡打卡系統管理者與表單填寫者。${infoMsg}`
  }
}

function sendErrToSNS(type, errMsg, entry) {
  printDividingLine("sendErrToSNS");
  console.log(errMsg);
  var msg = generateSNSErrMsg(type, errMsg, entry);
  
  var params = {
    Message: msg,
    Subject: '[心窩打卡] 代/換班伺服器更新異常',
    TopicArn: snsTopicARN
  };
  
  return sns.publish(params).promise()
    .then(res => {
      printDividingLine("send sns success")
    })
    .catch(err => {
      printDividingLine("send sns error")
      console.log(err)
      printDividingLine()
      
      return sendErrToSNS(type, errMsg, entry)
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