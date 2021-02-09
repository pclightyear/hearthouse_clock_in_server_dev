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

const axios = require('axios');
const aws = require('aws-sdk');

const dynamodb = new aws.DynamoDB({
    region:awsRegion, 
    apiVersion: "2012-08-10",
});

const sns = new aws.SNS({
    region:awsRegion,
    apiVersion: '2010-03-31'
});

// const googleTsOffset = 2209190400;
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
  const key = "2PACX-1vQp7gqWBLVnOs6l82xca9F3f2xuJc8vmqbRfA23h72N1FarJsYv-RiqTKpP7fzULBklWORA38pirpN3";
  const url = `https://docs.google.com/spreadsheets/d/e/${key}/pub?output=tsv`;

  return axios.get(url)
    .then(res => {
      var lines = []
      var lines = res.data.split('\n');
      var data = [];
      // const regex = /\r/gi;
      
      console.log(res.data)
      
      // for (var d in res.data) {
      //   for (var item in d) {
      //     if (item.includes('立俞')) {
      //       console.log(d)
      //     }
      //   }
      // }
      
      for(var i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace('\r', '');
        data.push(lines[i].split('\t'));
      }
      
      metadata = Array.from(data[0]);
      data.shift();
      
      // console.log(metadata);
      // console.log(data);
  
      var params = {
        ExpressionAttributeNames: {
         "#TS": "ts", 
         "#S": "status"
        }, 
        ProjectionExpression: "#TS, #S", 
        TableName: changeShiftLogtableName
      };
      
      return dynamodb.scan(params).promise()
        .then(res => {
          var logs = res.Items;
          var data_to_update = data.slice(logs.length);
          var updatePromises = [];
          
          // for (var i=0; i<data_to_update.length; i++) {
          //   var entry = data_to_update[i];
          //   let [leaveShifts, coverShifts, makeupShifts, makeupPeriodsNextShiftStatus] = processPeriods(entry);
            
          //   // 處理非同步
          //   updatePromises.push(
          //     checkAllShifts(entry, leaveShifts, coverShifts)
          //       .then(res => {
          //         printDividingLine("checkAllShifts success");
                  
          //         return changeShiftDBstate(res, res.entry, makeupShifts, makeupPeriodsNextShiftStatus)
          //           .then(res => {
          //             // 新增 log 至 HeartHouseChangeShiftLogs
          //             return addLogToChangeShiftDB(res.entry, true);
          //           })
          //           .catch(err => {
          //             var errMsg = 
          //               getDividingLineStr("CHANGE SHIFT FAIL") + 
          //               err.toString() +
          //               getDividingLineStr();
                        
          //             console.log(errMsg)

          //             // return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg)
          //           })
                  
          //       })
          //       .catch(err => {
          //         var errMsg = 
          //           getDividingLineStr("checkAllShifts FAIL") + 
          //           err.msg.toString() + '\n' + 
          //           getDividingLineStr();
          //         printDividingLine(errMsg);
                    
          //         return addLogToChangeShiftDB(err.entry, false, errMsg);
          //       })
          //   )
          // }
          
          // return Promise.all(updatePromises)
          //   .then(values => {
          //     printDividingLine("UPDATE ALL SUCCESS")
          //     printDividingLine(Date().toString())
          //     return {
          //       statusCode: 200,
          //       success: true,
          //       body: "更新代/換班狀態",
          //   };
          //   })
          //   .catch(err => {
          //     var errMsg = 
          //       getDividingLineStr("UPDATE FAIL") +
          //       err.toString() + '\n' + 
          //       getDividingLineStr();
              
          //     // return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg)
          //   })
          
        })
        .catch(err => {
          var errMsg = 
            getDividingLineStr("SCAN CHANGE SHIFT DB FAIL") +
            err.toString() + '\n' + // an error occurred
            getDividingLineStr();
          
          return sendErrToSNS(LAMBDA_ERROR_TYPE.AWS_FAIL, errMsg)
        })
    })
    .catch(err => {
      var errMsg = 
        getDividingLineStr("GET GOOGLE FORM FAIL") +
        err.toString() + '\n' +
        getDividingLineStr();
      
      return sendErrToSNS(LAMBDA_ERROR_TYPE.GOOGLE_FORM_FAIL, errMsg)
    })
};

function processPeriods(entry) {
  var leavePeriods = [];
  var coverPeriods = [];
  var makeupPeriods = [];
  var makeupPeriodsNextShiftStatus = [];
  
  console.log(entry)
  
  leavePeriods.push(processDate(entry[5], entry[6]))
  leavePeriods.push(processDate(entry[7], entry[8]))
  leavePeriods.push(processDate(entry[9], entry[10]))
  
  coverPeriods.push(processDate(entry[11], entry[12]))
  coverPeriods.push(processDate(entry[13], entry[14]))
  coverPeriods.push(processDate(entry[15], entry[16]))
  
  makeupPeriods.push(processMakeupDate(entry[17], entry[18]))
  makeupPeriods.push(processMakeupDate(entry[19], entry[20]))
  makeupPeriods.push(processMakeupDate(entry[21], entry[22]))
  
  makeupPeriodsNextShiftStatus = getNextShiftStatus(entry)
  
  leavePeriods = leavePeriods.filter(Boolean);
  coverPeriods = coverPeriods.filter(Boolean);
  makeupPeriods = makeupPeriods.filter(Boolean);
  
  return [leavePeriods, coverPeriods, makeupPeriods, makeupPeriodsNextShiftStatus];
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

function getNextShiftStatus(entry) {
  var status = []
  var indices = [];
  // even if shift_indices.length < 3, this function
  // still produce result that could works
  
  indices.push(getTimeIdx(entry[17], entry[18]))  // 補班日期&時段 1
  indices.push(getTimeIdx(entry[19], entry[20]))  // 補班日期&時段 2
  indices.push(getTimeIdx(entry[21], entry[22]))  // 補班日期&時段 3
  
  function getTimeIdx(date, time) {
    if (!date || !time) {
      return 10000;
    }
    
    let [yyyy, mm, dd] = date.split('/')
    let [weekdayStr, shiftStr] = time.split(' ')
    let weekday = CHINESE_WEEKDAY_TO_NUM[weekdayStr] - 1;
    let shiftIdx = SHIFT_STR_TO_IDX[shiftStr];
    
    return parseInt(yyyy) + parseInt(mm) + parseInt(dd) + (weekday * 12 + shiftIdx) + weekday;
  }
  
  indices.sort(function(a, b){return a - b})
  
  // calculate checkpoints
  if (indices[0] + 1 == indices[1]) {
    // ooo all shifts are adjacent
    if (indices[1] + 1 == indices[2]) {
      status.push({
        "checkNextTwoShifts": true,
        "checkOnlyNextShift": false    
      })
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": false    
      })
    } 
    // oo o the first two shifts is adjacent
    else {
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": true    
      })
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": false    
      })
    }
  } else {
    // o oo the last two shifts is adjacent
    if (indices[1] + 1 == indices[2]) {
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": false 
      })
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": true    
      })
    } 
    // o o o no shifts are adjacent
    else {
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": false 
      })
      status.push({
        "checkNextTwoShifts": false,
        "checkOnlyNextShift": false    
      })
    }
  }

  status.push({
    "checkNextTwoShifts": false,
    "checkOnlyNextShift": false    
  })

  return status;
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

function changeShiftDBstate(res, entry, makeupShifts, makeupPeriodsNextShiftStatus) {
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
        "checkNextTwoShifts": item.checkNextTwoShifts,
        "checkOnlyNextShift": item.checkOnlyNextShift,
        "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
        "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
        "penalty": {"N": PENALTY}
      })
    })
    
    coverShiftItems.forEach(item => {
      requests_items.push({
        "name": leaveName,
        "ts": item.ts,
        "checkNextTwoShifts": item.checkNextTwoShifts,
        "checkOnlyNextShift": item.checkOnlyNextShift,
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
        "checkNextTwoShifts": item.checkNextTwoShifts,
        "checkOnlyNextShift": item.checkOnlyNextShift,
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
        "checkNextTwoShifts": {"BOOL": makeupPeriodsNextShiftStatus[i].checkNextTwoShifts },
        "checkOnlyNextShift": {"BOOL": makeupPeriodsNextShiftStatus[i].checkOnlyNextShift },
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