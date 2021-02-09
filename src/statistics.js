// shiftList = [
//     {
//         "uuid": {
//             "S": 
//         },
//         "ts": {
//             "N": 
//         },
//         "checkNextTwoShifts": {
//             "BOOL": 
//         },
//         "checkOnlyNextShift": {
//             "BOOL": 
//         },
//         "name": {
//             "S": 
//         },
//         "penalty": {
//             "N": 
//         },
//         "status": {
//             "N": 
//         },
//
//     },
//     ...
// ]

import './index.css';
import './statistics.css';
const config = require('./config.json');
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
    var shiftTableName = config.DEV.ShiftTableName;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
    var shiftTableName = config.PROD.ShiftTableName;
}

// var nameList = [];
var shiftList = [];
// var shiftInfoList = [];

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

const CHANGE_SHIFT_STATUS = {
    "CHANGE_LEAVE": 0,  // 換班的請假者
    "CHANGE_COVER": 1,  // 換班的代班者
    "COVER_LEAVE": 2,    // 代班的請假者
    "COVER_COVER": 3,   // 代班的代班者
    "NORMAL": 4,
    "DELETE_FROM_APP": 5
}

// fetch shifts from dynamoDB
export function fetchAllShifts() {
    var params = {
        TableName: shiftTableName
    };

    dynamodb.scan(params, (err,res) => {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg()
        } else {
            shiftList = res.Items
            // console.log(shiftList)
            if (!shiftList) {
                displayErrorMsg()
            }

            loadSuccessUIChange()
        }
    });
}

var FILTER_BTN = "filter-btn";
var LOADING_HINT = "loading-hint";

function loadSuccessUIChange() {
    displayFilterButton();
    removeLoadingHint();
}

function displayFilterButton() {
    document.getElementById(FILTER_BTN).style.display = "block";
}

function removeLoadingHint() {
    document.getElementById(LOADING_HINT).style.display = "none";
}

var START_SELECT_MONTH = "start-date-select-month";
var START_SELECT_DAY = "start-date-select-day";
var END_SELECT_MONTH = "end-date-select-month";
var END_SELECT_DAY = "end-date-select-day";
var RANK_LIST = "rank-list";

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

var COLOR_BAR_WIDTH_RATIO = 0.7;
var NO_ITEM_PARAGRAPH = "no-item";

export function clearStatistics() {
    document.getElementById(NO_ITEM_PARAGRAPH).style.display = "none";
    var rank_list = document.getElementById(RANK_LIST);
    while (rank_list.lastElementChild) {
        rank_list.removeChild(rank_list.lastElementChild);
    }

    setTimeout(displayStatistics, 800);
}

function displayStatistics() {
    var startMonth = document.getElementById(START_SELECT_MONTH).selectedIndex;
    var startDay = document.getElementById(START_SELECT_DAY).selectedIndex;
    var endMonth = document.getElementById(END_SELECT_MONTH).selectedIndex;
    var endDay = document.getElementById(END_SELECT_DAY).selectedIndex;

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

    // filter & accumulate penalty
    var statistics = {}

    shiftList.forEach(s => {
        var name = s.name.S;
        var ts = parseInt(s.ts.N);
        var tsDate = new Date(ts);
        var statusChangeShift = parseInt(s.statusChangeShift.N);
        var penalty = parseInt(s.penalty.N);

        if (startDate <= tsDate && tsDate <= endDate && statusChangeShift == CHANGE_SHIFT_STATUS.NORMAL) {
            if (!statistics[name]) {
                statistics[name] = 0;
            }
            statistics[name] += penalty;
        }
    })
    
    var sortedStatistics = getSortedDict(statistics);
    var rank_list = document.getElementById(RANK_LIST);

    if (sortedStatistics.length > 0) {
        var maxPenalty = sortedStatistics[0][1];

        sortedStatistics.forEach((s, i) => {
            var div = document.createElement("div");
            div.className = "row rank-list-row";
        
            div.appendChild(addRankListRowTextDiv(s[0]));   // add name 
            div.appendChild(addRankListRowTextDiv(Math.ceil(parseInt(s[1])/60)));   // add penalty
            div.appendChild(addPenaltyColorBar(s[1]/maxPenalty*COLOR_BAR_WIDTH_RATIO, i));   // display bar

            rank_list.appendChild(div);
        })

    } else {
        document.getElementById(NO_ITEM_PARAGRAPH).style.display = "inline"
    }
}

function addRankListRowTextDiv(text) {
    var div = document.createElement("div");
    div.className = "rank-list-row-text";
    div.innerText = text;

    return div;
}

function addPenaltyColorBar(length, rank) {
    var bar = document.createElement("div");
    bar.style.width = `${length*100}%`;

    if (rank < 3) {
        bar.style.backgroundColor = "#DC3545";
    } else {
        bar.style.backgroundColor = "rgb(40, 167, 69)";
    }

    return bar;
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

function displayNoDateErrMsg() {
    alert("請輸入起始日期。")
}

function displayErrorMsg() {
    alert("出現異常狀態，請按F5重整頁面。")
}

function displayErrDateMsg() {
    alert("請輸入正確的起始日期。")
}