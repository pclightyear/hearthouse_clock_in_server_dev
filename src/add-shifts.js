import './index.css';
import './shifts.css';
import './add-shifts.css';
const config = require('./config.json');
const shifts_utils = require('./shifts-min.json')
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
    var ShiftTableName = config.DEV.ShiftTableName;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
    var ShiftTableName = config.PROD.ShiftTableName;
}

var nameList = [];
var shiftInfoList = shifts_utils.shiftList;
var formIndex = 0;
const shift_select_option_color = ['purple', 'red', 'blue', 'brown', '#ff8503']

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

AWS.config.update({
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
    })
});

var lambda = new AWS.Lambda({
    apiVersion: '2015-03-31'
});

var fetchNameListSuccess = false;
var fetchShiftListSuccess = false;
var populateDateFormSuccess = false;

// fetch name list from dynamoDB
export function fetchNameList() {
    var params = {
        FunctionName: "hearthouseGetNameList"
    };

    lambda.invoke(params, function(err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            displayErrorMsg()
        }  
        else {
            var res = JSON.parse(data.Payload)
            nameList = res.nameList;
            nameList.sort()
        
            if (!nameList) {
                displayErrorMsg()
            }

            fetchNameListSuccess = true;
            loadSuccessUIChange();
        }
    });
}

var START_SELECT_YEAR = "start-date-select-year";
var START_SELECT_MONTH = "start-date-select-month";
var START_SELECT_DAY = "start-date-select-day";
var END_SELECT_YEAR = "end-date-select-year";
var END_SELECT_MONTH = "end-date-select-month";
var END_SELECT_DAY = "end-date-select-day";
var FORM_GROUPS = "form-groups";
var LOADING_HINT = "loading-hint";
var SEND_BTN = "send-btn";
var NEW_LINE_BTN = "new-line-btn";

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

    populateDateFormSuccess = true;
    loadSuccessUIChange();
}

function loadSuccessUIChange() {
    if (fetchNameListSuccess && populateDateFormSuccess) {
        displayButtons();
        removeLoadingHint();
        if (!PRODUCTION) {
            document.getElementById(START_SELECT_MONTH).selectedIndex = 2;
            document.getElementById(START_SELECT_DAY).selectedIndex = 8;
            document.getElementById(END_SELECT_MONTH).selectedIndex = 2;
            document.getElementById(END_SELECT_DAY).selectedIndex = 12;
        }
    }
}

function displayButtons() {
    document.getElementById(SEND_BTN).style.display = "block";
    document.getElementById(NEW_LINE_BTN).style.display = "block";
}

function removeLoadingHint() {
    document.getElementById(LOADING_HINT).style.display = "none";
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

export function addNewRow() {
    var form_groups = document.getElementById(FORM_GROUPS);
    var form = document.createElement("form");
    form.className = "form-element";
    form.id = `form-${formIndex}`
   
    var form_div = document.createElement("div");
    form_div.className = "form-row justify-content-center";

    form_div.appendChild(addNameSelect()); // name select
    form_div.appendChild(addShiftSelect(1)); // shift 1 select
    form_div.appendChild(addShiftSelect(2)); // shift 2 select
    form_div.appendChild(addShiftSelect(3)); // shift 3 select
    form_div.appendChild(addDeleteButton()); // delete button

    form.appendChild(form_div);
    form_groups.appendChild(form);

    formIndex++;
}

function addNameSelect() {
    var div = document.createElement("div");
    div.className = "col-2 my-1";

    var select = document.createElement("select");
    select.className = "form-control name-select";
    
    var title_option = document.createElement("option");
    var title_text = document.createTextNode("名字");
    title_option.id = "name_title";
    title_option.appendChild(title_text);

    select.appendChild(title_option);
    // select.selectedOptions = "name_title";

    nameList.forEach(name => {
        var option = document.createElement("option");
        var text = document.createTextNode(name);
        option.appendChild(text);
        select.appendChild(option);
    })
    
    div.appendChild(select);
    return div;
}

function addShiftSelect(order) {
    var div = document.createElement("div");
    div.className = "col-2 my-1";

    var select = document.createElement("select");
    select.className = `form-control shift-select-${order}`;
    
    var title_option = document.createElement("option");
    var title_text = document.createTextNode(`時段${order}`);
    title_option.id = `shift_title${order}`;
    title_option.appendChild(title_text);

    select.appendChild(title_option);
    // select.selectedOptions = `shift_title${order}`;

    shiftInfoList.forEach((shiftInfo, i) => {
        var option = document.createElement("option");
        var text = document.createTextNode(shiftInfo.display);
        var colorIdx = Math.floor(i / 12);

        option.style.color = shift_select_option_color[colorIdx];
        option.appendChild(text);
        select.appendChild(option);
    })
    
    div.appendChild(select);
    return div;
}

function addDeleteButton() {
    var delete_button_div = document.createElement("div");
    delete_button_div.className = "col-1 my-1";

    var delete_button = document.createElement("button");
    delete_button.type = "button";
    delete_button.className = "btn btn-danger";
    delete_button.addEventListener('click', deleteRowEntry);
    delete_button.id = `deleteButton${formIndex}`;

    var text = document.createTextNode("刪除");
    delete_button.appendChild(text);

    delete_button_div.appendChild(delete_button);
    return delete_button_div;
}

function deleteRowEntry() {
    var row_id = this.id;
    row_id = `form-${row_id.replace( /^\D+/g, '')}`;
    var form_groups = document.getElementById("form-groups");
    var row_to_removed = document.getElementById(row_id);
    form_groups.removeChild(row_to_removed);
}

var YEAR_OFFSET = 2019;

export function updateShifts() {
    // start date & end date
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

    if (startDate > endDate) {
        displayErrDateMsg();
        return;
    }

    // shifts extract
    var shifts_index = []
    $(`#${FORM_GROUPS}`).children().each((index, form) => {
        var shift = []
        var name_idx;
        $(".form-control", form).each((index, select) => {
            var idx = select.selectedIndex;

            if (index == 0) {   // name
                name_idx = idx;
            } else {    // shift
                if (idx > 0) {
                    shift.push(idx + Math.floor((idx-1) / 12)); // prevent cross day adjacent shift
                }
            }
        })

        shift.sort(function(a, b){return a - b})
        shifts_index.push([name_idx, shift]);
    })
    
    // generate checkpoints within start date and end date
    var shift_requests = []
    var err_request_info = []
    var empty_request_info = []
    var isSomeRowNoName = false;
    var isSomeRowNoShift = false;

    shifts_index.forEach(row => {
        var name_index = row[0] - 1;
        var shift_indices = [...row[1]]

        if (name_index == -1) {
            isSomeRowNoName = true;
            return;
        }

        if (shift_indices.length == 0) {
            isSomeRowNoShift = true;
            return;
        }

        var currentDate = new Date(startDate);
        
        var row_shifts = []
        // generate shifts week by week
        while (currentDate <= endDate) {
            shift_indices.forEach((shift_index, i) => {
                if (shift_index != 0) {
                    var info = shiftInfoList[shift_index-Math.ceil((shift_index) / 13)] // get correct info
                    var nextShift = getNextCheckPointOrShift(currentDate, info.weekday, info.h, info.m)
                    
                    if (nextShift <= endDate) {
                        row_shifts.push({
                            "PutRequest": {
                                "Item": {
                                    "name": {"S": nameList[name_index]},
                                    "ts": {"N": nextShift.getTime().toString()},
                                    "statusClockIn": {"N": CLOCK_IN_STATUS.ABSENCE.toString()},
                                    "statusChangeShift": {"N": CHANGE_SHIFT_STATUS.NORMAL.toString()},
                                    "penalty": {"N": "3600"}
                                }
                            }
                        })
                    }
                }
            })

            currentDate.setDate(currentDate.getDate() + 7)
        }

        splitRowShifts(row_shifts, shift_indices.length).forEach(s => {
            shift_requests.push(s)
        });

        // console.log(shift_indices);
        
        shift_indices.forEach(shift_index => {
            err_request_info.push(`${nameList[name_index]}   ${shiftInfoList[shift_index-Math.ceil((shift_index) / 13)].display}`)  // get correct info
            empty_request_info.push(`${nameList[name_index]}   ${shiftInfoList[shift_index-Math.ceil((shift_index) / 13)].display}`)    // get correct info
        })
    })

    if (shifts_index.length == 0) {
        displayNoRowErrMsg();
        return;
    }
    
    if (isSomeRowNoName) {
        displayRowNoNameErrMsg();
        return;
    }

    if (isSomeRowNoShift) {
        displayRowNoShiftErrMsg();
        return;
    }

    var fail_requests = [];
    var empty_requests = [];
    var finished_requests = 0;
    shift_requests.forEach((shifts, i) => {
        // console.log(shifts)

        if (shifts.length == 0) {
            finished_requests += 1;
            empty_requests.push(empty_request_info[i])
            checkIfAddShiftAllProcessed();
        } else {
            var params = {
                FunctionName: "hearthouseAddShifts", 
                Payload: JSON.stringify({
                    "requests": {
                        "RequestItems": {
                            [ShiftTableName]: shifts
                        }
                    },
                    "errorMsg": err_request_info[i]
                }), 
            };
    
            console.log(params);
    
            lambda.invoke(params, (err, data) => {
                finished_requests += 1;
                if (err) {
                    console.log(err, err.stack) // an error occurred
                    fail_requests.push(err_request_info[i])
                }  
                else {
                    var res = JSON.parse(data.Payload)
                    // console.log(res); // successful response
                    if (res.success) {
                        console.log(`Batch ${i+1} upload success`);
                    } else {
                        console.log(`Batch ${i+1} upload fail`);
                        fail_requests.push(data.body)
                    }
                    
                    checkIfAddShiftAllProcessed();
                }
            });
        }

        function checkIfAddShiftAllProcessed() {
            if (finished_requests == shift_requests.length) {
                if (fail_requests.length == 0 && empty_requests.length == 0) {
                    displayAddShiftsSuccessMsg()
                    clearAddShiftForm()
                } else {
                    printDividingLine("fail_requests")
                    console.log(fail_requests.join('\n'))
                    printDividingLine("empty_requests")
                    console.log(empty_requests.join('\n'))
                    displayAddShiftsErrMsg(fail_requests.join('\n'), empty_requests.join('\n'))
                }
            }
        }
    })
}

function getNextCheckPointOrShift(currentDate, weekday, hour, min) {
    var date = new Date(currentDate);
    var currentDay = date.getDay();
    if (currentDay != weekday) {
        var addDay = mod((weekday - currentDay), 7);
        date.setDate(date.getDate() + addDay)
    }
    date.setHours(hour)
    date.setMinutes(min)
    return date;
}

function splitRowShifts(row_shifts, l) {
    var first_shift = [];
    var second_shift = [];
    var third_shift = [];

    if (l == 1) {
        return [row_shifts];

    } else if (l == 2) {
        for(var i = 0; i < row_shifts.length; i++) {
            if (i % 2 == 0) {
                first_shift.push(row_shifts[i]);
            } else if (i % 2 == 1) {
                second_shift.push(row_shifts[i]);
            }
        }

        return [first_shift, second_shift];

    } else if (l == 3) {
        for(var i = 0; i < row_shifts.length; i++) {
            if (i % 3 == 0) {
                first_shift.push(row_shifts[i]);
            } else if (i % 3 == 1) {
                second_shift.push(row_shifts[i]);
            } else {
                third_shift.push(row_shifts[i]);
            }
        }

        return [first_shift, second_shift, third_shift];
    }     

    return [];
}

function clearAddShiftForm() {
    $(`#${FORM_GROUPS}`).empty()
    document.getElementById(START_SELECT_MONTH).selectedIndex = 0;
    document.getElementById(START_SELECT_DAY).selectedIndex = 0;
    document.getElementById(END_SELECT_MONTH).selectedIndex = 0;
    document.getElementById(END_SELECT_DAY).selectedIndex = 0;
}

function mod(n, m) {
    return ((n % m) + m) % m;
}

function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

var LINE_MSG_LENGTH = 75;

function printDividingLine(msg) {
    var m = msg || "";
    var l = Math.floor((LINE_MSG_LENGTH - m.length) / 2)
    var r = LINE_MSG_LENGTH - m.length - l;
    var sign = "-"

    console.log(`${sign.repeat(l)}${m}${sign.repeat(r)}`)
}  

function displayErrorMsg() {
    alert("出現異常狀態，請按F5重整頁面。")
}

function displayAddShiftsErrMsg(fail_requests, empty_requests) {
    alert(`
        以下班表無新增班表：
        ${empty_requests ? empty_requests : "無"}

        以下班表新增班表異常：
        ${fail_requests ? fail_requests : "無"}
        
        請重新嘗試。
    `)
}

function displayNoRowErrMsg() {
    alert("請輸入至少一個班表")
}

function displayRowNoNameErrMsg() {
    alert("請輸入名字")
}

function displayRowNoShiftErrMsg() {
    alert("請填入班表內容")
}

function displayAddShiftsSuccessMsg() {
    alert("新增班表成功！")
}

function displayNoDateErrMsg() {
    alert("請輸入起始日期。")
}

function displayErrDateMsg() {
    alert("請輸入正確的起始日期。")
}