import './index.css';
import './shifts.css';
import './delete-shifts.css';
const config = require('./config.json');
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
    var tableName = config.DEV.ShiftTableName;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
    var tableName = config.PROD.ShiftTableName;
}

AWS.config.update({
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
    })
});

var lambda = new AWS.Lambda({
    apiVersion: '2015-03-31'
});

const dynamodb = new AWS.DynamoDB({
    apiVersion: "2012-08-10",
});

var START_SELECT_YEAR = "start-date-select-year";
var START_SELECT_MONTH = "start-date-select-month";
var START_SELECT_DAY = "start-date-select-day";
var END_SELECT_YEAR = "end-date-select-year";
var END_SELECT_MONTH = "end-date-select-month";
var END_SELECT_DAY = "end-date-select-day";

export function populateDateForm() {
    var start_year_select = document.getElementById(START_SELECT_YEAR);
    var start_month_select = document.getElementById(START_SELECT_MONTH);
    var start_day_select = document.getElementById(START_SELECT_DAY);
    var end_year_select = document.getElementById(END_SELECT_YEAR);
    var end_month_select = document.getElementById(END_SELECT_MONTH);
    var end_day_select = document.getElementById(END_SELECT_DAY);

    populateYearSelect(start_year_select);
    populateMonthSelect(start_month_select);
    populateDaySelect(start_day_select);
    populateYearSelect(end_year_select);
    populateMonthSelect(end_month_select);
    populateDaySelect(end_day_select);
}

function populateYearSelect(year_select) {
    var i;
    for (i = 2020; i <= 2099; i++) {
        var option = document.createElement("option");
        var text = document.createTextNode(i);
        option.appendChild(text);
        year_select.appendChild(option);
    }
}

function populateMonthSelect(month_select) {
    var i;
    for (i = 1; i <= 12; i++) {
        var option = document.createElement("option");
        var text = document.createTextNode(i);
        option.appendChild(text);
        month_select.appendChild(option);
    }
}

function populateDaySelect(day_select) {
    var i;
    for (i = 1; i <= 31; i++) {
        var option = document.createElement("option");
        var text = document.createTextNode(i);
        option.appendChild(text);
        day_select.appendChild(option);
    }
}

export function displayDeleteShiftsForm() {
    var deleteConfirmForm = document.getElementById("delete-form");
    deleteConfirmForm.style.display = "block"
}

function hideDeleteShiftsForm() {
    var deleteConfirmForm = document.getElementById("delete-form");
    deleteConfirmForm.style.display = "none"
}

export function displayDeleteAllShiftsConfirmForm() {
    var deleteConfirmForm = document.getElementById("delete-all-confirm-form");
    deleteConfirmForm.style.display = "block"
}

function hideDeleteAllShiftsConfirmForm() {
    var deleteConfirmForm = document.getElementById("delete-all-confirm-form");
    deleteConfirmForm.style.display = "none"
}

var DELETE_CONFIRM_TEXT = "deleteShift";
var DELETE_CONFIRM_INTPUT = "delete-confirm-input";
var YEAR_OFFSET = 2019;

export function deleteIntervalShifts() {
    var confirmText = document.getElementById(DELETE_CONFIRM_INTPUT).value;
    if (confirmText === DELETE_CONFIRM_TEXT) {
        // process select start date & end date
        var startYear = document.getElementById(START_SELECT_YEAR).selectedIndex + YEAR_OFFSET;
        var startMonth = document.getElementById(START_SELECT_MONTH).selectedIndex;
        var startDay = document.getElementById(START_SELECT_DAY).selectedIndex;
        var endYear = document.getElementById(END_SELECT_YEAR).selectedIndex + YEAR_OFFSET;
        var endMonth = document.getElementById(END_SELECT_MONTH).selectedIndex;
        var endDay = document.getElementById(END_SELECT_DAY).selectedIndex;

        if (PRODUCTION && (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay)) {
            displayNoDateErrMsg();
            return;
        }

        // console.log(`${startMonth}/${startDay} ~ ${endMonth}/${endDay}`);
        let startDate = new Date(startYear, startMonth-1, startDay);
        let endDate = new Date(endYear, endMonth-1, endDay, 23, 59, 59);

        if (PRODUCTION && (startDate > endDate)) {
            displayErrDateMsg();
            return;
        }

        var exprAttrNames = {
            "#ts": "ts",
        }
        var exprAttrValues = {
            ":start_ts": {
                N: startDate.getTime().toString()
            },
            ":end_ts": {
                N: endDate.getTime().toString()
            }
        }
        var filterExpr = "#ts >= :start_ts and #ts <= :end_ts"
        
        var scanParams = {
            ExpressionAttributeNames: exprAttrNames,
            ExpressionAttributeValues: exprAttrValues,
            FilterExpression: filterExpr, 
            TableName: tableName
        };
    
        // TODO: need to await delete result to display suceess or error msg
        dynamodb.scan(scanParams, (err, res) => {
            if (err) {
                console.log(err, err.stack); // an error occurred
                displayDeleteShiftsErrMsg();
            } else {
                var itemList = res.Items;
                if (!itemList) {
                    displayDeleteShiftsErrMsg();
                }
                if (itemList.length == 0) {
                    displayNoShiftToDeleteMsg();
                    return;
                }
    
                console.log(itemList)
        
                // batch delete
                var requests = []
    
                itemList.forEach(item => {
                    var name = item.name.S;
                    var ts = item.ts.N;
    
                    requests.push({
                        "DeleteRequest": {
                            "Key": {
                                "name": {"S": name},
                                "ts": {"N": ts}
                            }
                        }
                    })
                })
    
                var deleteParams = {
                    "RequestItems": {
                        [tableName]: requests
                    }
                }
    
                dynamodb.batchWriteItem(deleteParams, (err, res) => {
                    if (err) {
                        console.log(err, err.stack); // an error occurred
                        displayDeleteShiftsErrMsg();
                    } else {
                        displayDeleteShiftsSuccessMsg();
                    }
                })
            }
        });
    } else {
        displayConfirmTextErrMsg()
    }

    hideDeleteShiftsForm();
    hideDeleteAllShiftsConfirmForm();
}

var DELETE_ALL_CONFIRM_TEXT = "deleteAllShift";
var DELETE_ALL_CONFIRM_INTPUT = "delete-all-confirm-input";

export function deleteAllShifts() {
    var confirmText = document.getElementById(DELETE_ALL_CONFIRM_INTPUT).value;
    if (confirmText === DELETE_ALL_CONFIRM_TEXT) {
        // TODO: need to await delete result to display suceess or error msg
        var scanParams = {
            TableName: tableName
        };

        dynamodb.scan(scanParams, (err, res) => {
            if (err) {
                console.log(err, err.stack); // an error occurred
                displayDeleteAllShiftsErrMsg();
            } else {
                var itemList = res.Items;
                if (!itemList) {
                    displayDeleteAllShiftsErrMsg();
                }
                if (itemList.length == 0) {
                    displayNoShiftToDeleteMsg();
                    return;
                }
    
                console.log(itemList)
        
                // batch delete
                var requests = []
    
                itemList.forEach(item => {
                    var name = item.name.S;
                    var ts = item.ts.N;
    
                    requests.push({
                        "DeleteRequest": {
                            "Key": {
                                "name": {"S": name},
                                "ts": {"N": ts}
                            }
                        }
                    })
                })
    
                var deleteParams = {
                    "RequestItems": {
                        [tableName]: requests
                    }
                }
    
                dynamodb.batchWriteItem(deleteParams, (err, res) => {
                    if (err) {
                        console.log(err, err.stack); // an error occurred
                        displayDeleteAllShiftsErrMsg();
                    } else {
                        displayDeleteAllShiftsSuccessMsg();
                    }
                })
            }
        });
    } else {
        displayConfirmTextErrMsg()
    }

    hideDeleteShiftsForm();
    hideDeleteAllShiftsConfirmForm();
}

function displayNoShiftToDeleteMsg() {
    alert("沒有班表需要被刪除。")
}

function displayDeleteShiftsSuccessMsg() {
    alert("刪除班表成功！")
}

function displayDeleteShiftsErrMsg() {
    alert("刪除班表失敗，請重新嘗試")
}

function displayDeleteAllShiftsSuccessMsg() {
    alert("刪除全部班表成功！")
}

function displayDeleteAllShiftsErrMsg() {
    alert("刪除全部班表失敗，請重新嘗試")
}

function displayConfirmTextErrMsg() {
    alert("輸入字串錯誤，請重新輸入")
}

function displayNoDateErrMsg() {
    alert("請輸入起始日期。")
}

function displayErrDateMsg() {
    alert("請輸入正確的起始日期。")
}