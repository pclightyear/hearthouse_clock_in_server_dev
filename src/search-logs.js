// logList = [
//     {
//         "name": {
//             "S": 
//         },
//         "ts": {
//             "N": 
//         }
//     },
//     ...
// ]

import './index.css';
import './search-logs.css';
const config = require('./config.json');
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
    var BucketName = config.DEV.BucketName;
    var NameListFileKey = config.DEV.NameListFileKey;
    var logTableName = config.DEV.LogTableName;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
    var BucketName = config.PROD.BucketName;
    var NameListFileKey = config.PROD.NameListFileKey;
    var logTableName = config.PROD.LogTableName;
}

var nameList = [];
var logList = [];
var monthStrToNum = {
    "Jan": "01", 
    "Feb": "02", 
    "Mar": "03", 
    "Apr": "04", 
    "May": "05", 
    "Jun": "06", 
    "Jul": "07", 
    "Aug": "08", 
    "Sep": "09", 
    "Oct": "10", 
    "Nov": "11", 
    "Dec": "12"
}
var fetchNameSuccess = false;
var fetchLogSuccess = false;

AWS.config.update({
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
    })
});

var lambda = new AWS.Lambda({
    apiVersion: '2015-03-31'
});

var s3 = new AWS.S3({
    apiVersion: '2006-03-01',
});

const dynamodb = new AWS.DynamoDB({
    apiVersion: "2012-08-10",
});

// fetch name list from s3 bucket
export function fetchNameList() {
    var params = {
        Bucket: BucketName, 
        Key: NameListFileKey, 
    };

    s3.getObject(params, function(err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg()
        } else {
            var json = JSON.parse(data.Body.toString());
            nameList = json.nameList;
            // console.log(nameList);
        
            if (!nameList) {
                displayErrorMsg()
            }

            fetchNameSuccess = true;
            loadSuccessUIChange();
            populateNameForm();
        }
    });
}

// fetch logs from dynamoDB
export function fetchAllLogs() {
    var params = {
        TableName: logTableName
    };

    dynamodb.scan(params, (err,res) => {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg()
        } else {
            logList = res.Items
            // console.log(logList)
            if (!logList) {
                displayErrorMsg()
            }

            fetchLogSuccess = true;
            loadSuccessUIChange();
        }
    });
}

var NAME_FORM = "name-form";
var FILTER_BTN = "filter-btn";
var LOADING_HINT = "loading-hint";

function loadSuccessUIChange() {
    if (fetchLogSuccess && fetchNameSuccess) {
        displayNameForm();
        displayFilterButton();
        removeLoadingHint();
    }
}

function displayNameForm() {
    document.getElementById(NAME_FORM).style.display = "block";
}

function displayFilterButton() {
    document.getElementById(FILTER_BTN).style.display = "block";
}

function removeLoadingHint() {
    document.getElementById(LOADING_HINT).style.display = "none";
}

function populateNameForm() {
    var select = document.getElementById("name-select");

    nameList.forEach(name => {
        var option = document.createElement("option");
        var text = document.createTextNode(name);
        option.appendChild(text);
        select.appendChild(option);
    })
}

var START_SELECT_MONTH = "start-date-select-month";
var START_SELECT_DAY = "start-date-select-day";
var END_SELECT_MONTH = "end-date-select-month";
var END_SELECT_DAY = "end-date-select-day";
var NAME_SELECT = "name-select";
var LOG_LIST = "log-list";
var NO_ITEM_PARAGRAPH = "no-item";

export function populateDateForm() {
    var start_month_select = document.getElementById(START_SELECT_MONTH);
    var start_day_select = document.getElementById(START_SELECT_DAY);
    var end_month_select = document.getElementById(END_SELECT_MONTH);
    var end_day_select = document.getElementById(END_SELECT_DAY);

    populateMonthSelect(start_month_select);
    populateDaySelect(start_day_select);
    populateMonthSelect(end_month_select);
    populateDaySelect(end_day_select);

    if (!PRODUCTION) {
        start_month_select.selectedIndex = 1;
        start_day_select.selectedIndex = 1;
        end_month_select.selectedIndex = 9;
        end_day_select.selectedIndex = 1;
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

export function clearLogs() {
    document.getElementById(NO_ITEM_PARAGRAPH).style.display = "none";
    var log_list = document.getElementById(LOG_LIST);
    while (log_list.lastElementChild) {
        log_list.removeChild(log_list.lastElementChild);
    }

    setTimeout(displayLogs, 800);
}

function displayLogs() {
    var startMonth = document.getElementById(START_SELECT_MONTH).selectedIndex;
    var startDay = document.getElementById(START_SELECT_DAY).selectedIndex;
    var endMonth = document.getElementById(END_SELECT_MONTH).selectedIndex;
    var endDay = document.getElementById(END_SELECT_DAY).selectedIndex;
    var selectedName = document.getElementById(NAME_SELECT).value;

    if (PRODUCTION && (!startMonth || !startDay || !endMonth || !endDay)) {
        displayNoDateErrMsg();
        return;
    }

    // console.log(`${startMonth}/${startDay} ~ ${endMonth}/${endDay}`);
    let year = new Date().getFullYear()
    let startDate = new Date(year, startMonth-1, startDay)
    let endDate;

    // cross year
    if (startMonth > endMonth) {
        endDate = new Date(year+1, endMonth-1, endDay, 23, 59, 59)
    } else {
        endDate = new Date(year, endMonth-1, endDay, 23, 59, 59)
    }

    if (PRODUCTION && (startDate > endDate)) {
        displayErrDateMsg();
        return;
    }

    var logs = []

    logList.forEach(l => {
        var ts = parseInt(l.ts.N);
        var name = l.name.S;
        var tsDate = new Date(ts);

        if (selectedName == "名字(全部)" || selectedName == name) {
            if (startDate <= tsDate && tsDate <= endDate) {
                logs.push([ts, name])
            }
        }
        
    })

    var sortedLogs = getSortedLogs(logs);
    var log_list = document.getElementById(LOG_LIST);

    if (sortedLogs.length > 0) {
        sortedLogs.forEach((s, i) => {
            var div = document.createElement("div");
            div.className = "row log-list-row";
        
            div.appendChild(addLogListRowTextDiv(s[1]));   // add name 
            div.appendChild(addLogListRowTextDiv(getFormattedDate(s[0])));   // add date

            log_list.appendChild(div);
        })

    } else {
        document.getElementById(NO_ITEM_PARAGRAPH).style.display = "inline"
    }

}

function addLogListRowTextDiv(text) {
    var div = document.createElement("div");
    div.className = "log-list-row-text";
    div.innerText = text;

    return div;
}

function getFormattedDate(ts) {
    var date = new Date(ts)

    //  Mon Aug 24 2020 15:32:36 GMT+0800 (Taipei Standard Time)
    let [wd, mmStr, dd, yyyy, time] = date.toString().split(" ")
    // let [hh, min, ss] = date.toLocaleTimeString().slice(0,7).split(":")

    let mm = monthStrToNum[mmStr];
    // console.log(date.toJSON());

    return `${mm}/${dd}/${yyyy} ${time}`;
}

function getSortedLogs(logs) {
    logs.sort(function(first, second) {
        return first[0] - second[0];
    });

    return logs
}

function displayNoNameErrMsg() {
    alert("請輸入名字。")
}

function displayNoDateErrMsg() {
    alert("請輸入起始日期。")
}

function displayErrorMsg() {
    alert("出現異常狀態，請按F5重整頁面。")
}

function displayErrDateMsg() {
    alert("請輸入正確的起始日期。")
}