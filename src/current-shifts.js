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
import './shifts.css';
import './current-shifts.css';
const config = require('./config.json');
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
    var BucketName = config.DEV.BucketName;
    var ShiftListFileKey = config.DEV.ShiftListFileKey;
    var shiftTableName = config.DEV.ShiftTableName;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
    var BucketName = config.PROD.BucketName;
    var ShiftListFileKey = config.PROD.ShiftListFileKey;
    var shiftTableName = config.PROD.ShiftTableName;
}

// var nameList = [];
var shiftList = [];
var shiftInfoList = [];

const chineseWeekday = ["一", "二", "三", "四", "五"];
const chineseClockInStatus = [
    "無故缺席",
    "忘記打卡",
    "遲到",
    "準時",
]

const CLOCK_IN_STATUS = {
    "ABSENCE": 0,
    "FORGET": 1,
    "LATE": 2,
    "NORMAL": 3
}

const CHANGE_SHIFT_STATUS = {
    "CHANGE_LEAVE": 0,  // 換班的請假者
    "CHANGE_COVER": 1,  // 換班的代班者
    "COVER_LEAVE": 2,    // 代班的請假者
    "COVER_COVER": 3,   // 代班的代班者
    "NORMAL": 4,
    "DELETE_FROM_APP": 5
}

const STATUS_COLORS = [
    '#DC3545',
    '#17A2B8',  // amber
    '#FF5722',  // deep orange
    '#28A745',  // lime
]

var now;
var isUpdatingStatus;

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

            fetchShiftList();
        }
    });

}

// fetch shift list from s3 bucket
function fetchShiftList() {
    var params = {
        Bucket: BucketName, 
        Key: ShiftListFileKey, 
    };
    
    s3.getObject(params, function(err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg()
        } else {
            var json = JSON.parse(data.Body.toString());
            shiftInfoList = json;
            
            if (!shiftInfoList) {
                displayErrorMsg()
            }

            displayAllShifts();
        }
    });
}

var SHIFT_TABLE = "shift-table";
var SHIFT_CELL = "shift-cell";
var HOUR_CELL = "hour-cell"
var DATE_CELL = "date-cell";
var SINGLE_SHIFT = "single-shift";
var LOADING_HINT = "loading-hint";
var TABLE_ROW_COUNT = 13;
var TABLE_COL_COUNT = 6;
var TABLE_CELL_COUNT = 60;

function displayAllShifts() {
    var table = document.getElementById(SHIFT_TABLE);
    var i, j;

    for(i = 0; i < TABLE_ROW_COUNT; i++) {
        var row = document.createElement("tr");
        for(j = 0; j < TABLE_COL_COUNT; j++) {
            // col.className = "justify-content-center"
            
            // date display
            if (i == 0 && j != 0) { 
                var col = document.createElement("th");
                col.innerText = `${j}`;
                col.id = `${DATE_CELL}-${j}`
                col.className = DATE_CELL
                
                row.appendChild(col);
            } 
            // shift hours
            else if (i > 0 && j == 0) {   
                var col = document.createElement("th");
                col.innerText = `${shiftInfoList.shiftHours[i-1]}`;
                col.className = HOUR_CELL
                
                row.appendChild(col);
            } 
            // people on duty
            else if (i > 0) { 
                var col = document.createElement("td");
                col.id = `${SHIFT_CELL}-${i + (j-1) * (TABLE_ROW_COUNT - 1)}`;
                col.className = SHIFT_CELL
                
                row.appendChild(col);
            } else {
                var col = document.createElement("th");
                row.appendChild(col);
            }
        }
        table.appendChild(row);
    }

    if (PRODUCTION) {
        now = new Date()
    } else {
        now = new Date()
    }

    populateTableDate(now)
    populateTableCells(now)

    document.getElementById(LOADING_HINT).style.display = "none";
}

export function displayPreviousWeek() {
    if (now) {
        now.setDate(now.getDate() - 7)
        populateTableDate(now)
        clearTableCells()
        populateTableCells(now)
    } 
}

export function displayNextWeek() {
    if (now) {
        now.setDate(now.getDate() + 7)
        populateTableDate(now)
        clearTableCells()
        populateTableCells(now)
    }
}

function populateTableDate(currentDate) {
    var friday = new Date(getFriday(currentDate));

    var i;
    for (i = 5; i > 0; i--) {
        var dateCell = document.getElementById(`${DATE_CELL}-${i}`);
        dateCell.innerText = `${chineseWeekday[i-1]}\n${friday.getMonth()+1}/${friday.getDate()}`;
        
        friday.setDate(friday.getDate() - 1);
    }
}

function clearTableCells() {
    var i;
    for (i = 1; i <= TABLE_CELL_COUNT; i++) {
        var cell = document.getElementById(`${SHIFT_CELL}-${i}`);
        cell.innerText = "";
    }
}

function populateTableCells(currentDate) {
    var friday = new Date(getFriday(currentDate));
    var monday = new Date(friday);
    monday.setDate(friday.getDate() - 4);
    monday.setHours(1)

    // console.log(monday)
    // console.log(friday)

    shiftList.forEach((s, i) => {
        var name = s.name.S;
        var tsDate = new Date(parseInt(s.ts.N));
        var statusClockIn = parseInt(s.statusClockIn.N);
        var statusChangeShift = parseInt(s.statusChangeShift.N);
        var penalty = parseInt(s.penalty.N);
        // console.log(name)

        if (monday <= tsDate && tsDate <= friday && statusChangeShift == CHANGE_SHIFT_STATUS.NORMAL) {
            var shiftId = (tsDate.getDay() - 1) * 12 + getDailyShiftOrder(tsDate.getHours());
            // console.log(shiftId)

            var cell = document.getElementById(`${SHIFT_CELL}-${shiftId}`);
            var div = document.createElement("div");
            div.id = `${SINGLE_SHIFT}-${i}`;
            div.className = "singleShiftDiv";
            div.innerText = name;
            
            if (tsDate <= Date.now()) {
                div.addEventListener('mouseover', displayClockInStatus)
                div.addEventListener('mouseout', clearDisplayStatus)
                div.addEventListener('click', showUpdateShiftStatusForm)

                colorShiftStatus(statusClockIn, div)
            }
            
            cell.appendChild(div)
        }
    })
}

var updating_shift_id;

var UPDATE_STATUS_FORM = "update-status-form";
var UPDATE_STATUS_SELECT = "update-status-select";
var UPDATE_PENALTY_INPUT = "update-penalty-input";
var STATUS_STRING = "status-string";
var STATUS_PENALTY = "status-penalty";

function displayClockInStatus() {
    var status_string_div = document.getElementById(STATUS_STRING);
    var status_penalty_div = document.getElementById(STATUS_PENALTY);
    var shift_id;

    if (!isUpdatingStatus) {
        shift_id = this.id.replace( /^\D+/g, '');
    } else {
        shift_id = updating_shift_id;
    }

    var shift_info = shiftList[shift_id];
    var status = parseInt(shift_info.statusClockIn.N);

    status_string_div.innerText = `狀態: ${chineseClockInStatus[parseInt(shift_info.statusClockIn.N)]}`;
    status_penalty_div.innerText = `懲罰: ${Math.ceil(parseInt(shift_info.penalty.N)/60)}`;

    colorShiftStatus(status, status_string_div)
    colorShiftStatus(status, status_penalty_div)
}

function colorShiftStatus(status, div) {
    switch(status) {
        case CLOCK_IN_STATUS.ABSENCE:
            div.style.color = STATUS_COLORS[CLOCK_IN_STATUS.ABSENCE]
            div.style.fontWeight = "bold"
            break;
        case CLOCK_IN_STATUS.FORGET:
            div.style.color = STATUS_COLORS[CLOCK_IN_STATUS.FORGET]
            div.style.fontWeight = "bold"
            break;
        case CLOCK_IN_STATUS.LATE:
            div.style.color = STATUS_COLORS[CLOCK_IN_STATUS.LATE]
            div.style.fontWeight = "bold"
            break;
        case CLOCK_IN_STATUS.NORMAL:
            div.style.color = STATUS_COLORS[CLOCK_IN_STATUS.NORMAL]
            div.style.fontWeight = ""
            break;
        default:
            break;
    }
}

function showUpdateShiftStatusForm() {
    if (isUpdatingStatus) {
        clearUpdateStatusForm();
    }
    
    isUpdatingStatus = true;
    document.getElementById(UPDATE_STATUS_FORM).style.display = "block";
    document.getElementById(UPDATE_PENALTY_INPUT).value = 0;
    var shift_id = this.id.replace( /^\D+/g, '');
    updating_shift_id = shift_id;
    
    this.style.backgroundColor = "#f3d1f4";
    displayClockInStatus();
}

export function onUpdateStatusFormOptionClick() {
    var status = document.getElementById(UPDATE_STATUS_SELECT).selectedIndex;
    var penaltyInput = document.getElementById(UPDATE_PENALTY_INPUT);

    switch(status) {
        case CLOCK_IN_STATUS.ABSENCE:
            penaltyInput.value = 50;
            break;
        case CLOCK_IN_STATUS.FORGET:
            penaltyInput.value = 15;
            break;
        case CLOCK_IN_STATUS.NORMAL:
        default:
            penaltyInput.value = 0;
            break;
    }
}

export function updateStatus() {
    var newStatus = document.getElementById(UPDATE_STATUS_SELECT).selectedIndex;
    var newPenalty = document.getElementById(UPDATE_PENALTY_INPUT).value;

    if(!newPenalty) {
        displayUpdateStatusMissingPenaltyMsg()
        return;
    } else {
        // send update request
        var params = {
            ExpressionAttributeNames: {
                "#S": "statusClockIn", 
                "#P": "penalty"
            }, 
            ExpressionAttributeValues: {
                ":s": {
                    N: newStatus.toString()
                }, 
                ":p": {
                    N: newPenalty.toString()
                }
            }, 
            Key: {
                "name": {
                    S: shiftList[updating_shift_id].name.S
                },
                "ts": {
                    N: shiftList[updating_shift_id].ts.N
                }
            }, 
            // ReturnValues: "ALL_NEW", 
            TableName: shiftTableName, 
            UpdateExpression: "SET #S = :s, #P = :p"
        };

        dynamodb.updateItem(params, (err, res) => {
            if (err) {
                console.log(err, err.stack); // an error occurred
                displayErrorMsg();
            } else {
                displayUpdateStatusSuccessMsg();
                clearUpdateStatusForm();
                updateTableDisplay(newStatus, newPenalty);
            }
        });
    }
}

function clearUpdateStatusForm() {
    isUpdatingStatus = false;
    document.getElementById(UPDATE_STATUS_FORM).style.display = "none";
    document.getElementById(`${SINGLE_SHIFT}-${updating_shift_id}`).style.backgroundColor = "";
    
    clearDisplayStatus();
}

function clearDisplayStatus() {
    if (!isUpdatingStatus) {
        document.getElementById(STATUS_STRING).innerText = "";
        document.getElementById(STATUS_PENALTY).innerText = "";
    }
}

export function deleteShift() {
    if (!window.confirm("確定要刪除這個班表嗎?")) {
        return;
    }

    var params = {
        ExpressionAttributeNames: {
            "#CS": "statusChangeShift"
        }, 
        ExpressionAttributeValues: {
            ":cs": {
                N: CHANGE_SHIFT_STATUS.DELETE_FROM_APP.toString()
            }
        }, 
        Key: {
            "name": {
                S: shiftList[updating_shift_id].name.S
            },
            "ts": {
                N: shiftList[updating_shift_id].ts.N
            }
        }, 
        // ReturnValues: "ALL_NEW", 
        TableName: shiftTableName, 
        UpdateExpression: "SET #CS = :cs"
    };

    dynamodb.updateItem(params, (err, res) => {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg();
        } else {
            displayDeleteShiftSuccessMsg();
            clearUpdateStatusForm();
            deleteTableCellDisplay();
        }
    });
}

function updateTableDisplay(newStatus, newPenalty) {
    shiftList[updating_shift_id].statusClockIn.N = newStatus;
    shiftList[updating_shift_id].penalty.N = newPenalty;

    var div = document.getElementById(`${SINGLE_SHIFT}-${updating_shift_id}`);
    colorShiftStatus(newStatus, div);
}

function deleteTableCellDisplay() {
    var div = document.getElementById(`${SINGLE_SHIFT}-${updating_shift_id}`);
    div.remove();
}

function getDailyShiftOrder(hours) {
    return shiftInfoList.hourToDailyShiftOrder[hours];
}

function getFriday(currentDate) {
    var nextFriday = new Date(currentDate);
    var currentDay = nextFriday.getDay();

    // get Next Friday
    if (currentDay <= 5 || currentDay == 7) {
        var addDay = mod((5 - currentDay), 7);
        nextFriday.setDate(nextFriday.getDate() + addDay)
    } 
    // get previous Friday
    else {
        var addDay = mod((5 - currentDay), 7);
        nextFriday.setDate(nextFriday.getDate() + addDay - 7)
    }

    nextFriday.setHours(23)

    return nextFriday;
}

function mod(n, m) {
    return ((n % m) + m) % m;
}

export function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function displayErrorMsg() {
    alert("出現異常狀態，請按F5重整頁面。")
}

function displayUpdateStatusMissingPenaltyMsg() {
    alert("請填入懲罰值。")
}

function displayUpdateStatusSuccessMsg() {
    alert("更新狀態成功！")
}

function displayDeleteShiftSuccessMsg() {
    alert("刪除班表成功！")
}