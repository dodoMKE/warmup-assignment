const fs = require("fs");

function getShiftDuration(startTime, endTime) {
    function timeToSeconds(timeStr) {
        const [time, period] = timeStr.split(' ');
        let [hours, minutes, seconds] = time.split(':').map(Number);
        
        if (period === 'pm' && hours !== 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    let startSeconds = timeToSeconds(startTime);
    let endSeconds = timeToSeconds(endTime);
    
    if (endSeconds < startSeconds) {
        endSeconds += 24 * 3600;
    }
    
    let diffSeconds = endSeconds - startSeconds;
    let hours = Math.floor(diffSeconds / 3600);
    let minutes = Math.floor((diffSeconds % 3600) / 60);
    let seconds = diffSeconds % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getIdleTime(startTime, endTime) {
    function timeToSeconds(timeStr) {
        const [time, period] = timeStr.split(' ');
        let [hours, minutes, seconds] = time.split(':').map(Number);
        
        if (period === 'pm' && hours !== 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    let startSeconds = timeToSeconds(startTime);
    let endSeconds = timeToSeconds(endTime);
    
    if (endSeconds < startSeconds) {
        endSeconds += 24 * 3600;
    }
    
    const deliveryStart = 8 * 3600;
    const deliveryEnd = 22 * 3600;
    
    let idleSeconds = 0;
    
    if (startSeconds < deliveryStart) {
        idleSeconds += Math.min(deliveryStart, endSeconds) - startSeconds;
    }
    
    if (endSeconds > deliveryEnd) {
        idleSeconds += endSeconds - Math.max(deliveryEnd, startSeconds);
    }
    
    let hours = Math.floor(idleSeconds / 3600);
    let minutes = Math.floor((idleSeconds % 3600) / 60);
    let seconds = idleSeconds % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getActiveTime(shiftDuration, idleTime) {
    function timeToSeconds(timeStr) {
        let [hours, minutes, seconds] = timeStr.split(':').map(Number);
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    let shiftSeconds = timeToSeconds(shiftDuration);
    let idleSeconds = timeToSeconds(idleTime);
    
    let activeSeconds = shiftSeconds - idleSeconds;
    if (activeSeconds < 0) activeSeconds = 0;
    
    let hours = Math.floor(activeSeconds / 3600);
    let minutes = Math.floor((activeSeconds % 3600) / 60);
    let seconds = activeSeconds % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function metQuota(date, activeTime) {
    function timeToMinutes(timeStr) {
        let [hours, minutes, seconds] = timeStr.split(':').map(Number);
        return hours * 60 + minutes + seconds / 60;
    }
    
    const [year, month, day] = date.split('-').map(Number);
    const isEidPeriod = year === 2025 && month === 4 && day >= 10 && day <= 30;
    
    const quotaMinutes = isEidPeriod ? 6 * 60 : 8 * 60 + 24;
    const activeMinutes = timeToMinutes(activeTime);
    
    return activeMinutes >= quotaMinutes;
}

function addShiftRecord(textFile, shiftObj) {
    try {
        let fileContent = fs.readFileSync(textFile, 'utf8');
        let lines = fileContent.trim().split('\n').filter(line => line.trim() !== '');
        
        const exists = lines.some(line => {
            let columns = line.split(',');
            return columns[0] === shiftObj.driverID && columns[2] === shiftObj.date;
        });
        
        if (exists) {
            return {};
        }
        
        let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
        let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
        let activeTime = getActiveTime(shiftDuration, idleTime);
        let metQuotaResult = metQuota(shiftObj.date, activeTime);
        
        let newRecord = {
            driverID: shiftObj.driverID,
            driverName: shiftObj.driverName,
            date: shiftObj.date,
            startTime: shiftObj.startTime,
            endTime: shiftObj.endTime,
            shiftDuration: shiftDuration,
            idleTime: idleTime,
            activeTime: activeTime,
            metQuota: metQuotaResult,
            hasBonus: false
        };
        
        let lastIndexForDriver = -1;
        for (let i = 0; i < lines.length; i++) {
            let columns = lines[i].split(',');
            if (columns[0] === shiftObj.driverID) {
                lastIndexForDriver = i;
            }
        }
        
        let newLine = `${newRecord.driverID},${newRecord.driverName},${newRecord.date},${newRecord.startTime},${newRecord.endTime},${newRecord.shiftDuration},${newRecord.idleTime},${newRecord.activeTime},${newRecord.metQuota},${newRecord.hasBonus}`;
        
        if (lastIndexForDriver === -1) {
            lines.push(newLine);
        } else {
            lines.splice(lastIndexForDriver + 1, 0, newLine);
        }
        
        fs.writeFileSync(textFile, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
        
        return newRecord;
        
    } catch (error) {
        return {};
    }
}

function setBonus(textFile, driverID, date, newValue) {
    try {
        let fileContent = fs.readFileSync(textFile, 'utf8');
        let lines = fileContent.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            let columns = lines[i].split(',');
            if (columns[0] === driverID && columns[2] === date) {
                columns[9] = newValue.toString();
                lines[i] = columns.join(',');
                break;
            }
        }
        
        fs.writeFileSync(textFile, lines.join('\n'));
        
    } catch (error) {
    }
}

function countBonusPerMonth(textFile, driverID, month) {
    try {
        let fileContent = fs.readFileSync(textFile, 'utf8');
        let lines = fileContent.trim().split('\n').filter(line => line.trim() !== '');
        
        let monthPadded = month.padStart(2, '0');
        let driverFound = false;
        let bonusCount = 0;
        
        for (let line of lines) {
            let columns = line.split(',');
            
            columns = columns.map(col => col.trim());
            
            if (columns[0] === driverID) {
                driverFound = true;
                let dateMonth = columns[2].split('-')[1];
                
                if (dateMonth === monthPadded && columns[9].toLowerCase() === 'true') {
                    bonusCount++;
                }
            }
        }
        
        return driverFound ? bonusCount : -1;
        
    } catch (error) {
        return -1;
    }
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    try {
        let fileContent = fs.readFileSync(textFile, 'utf8');
        let lines = fileContent.trim().split('\n').filter(line => line.trim() !== '');
        
        function timeToSeconds(timeStr) {
            let [hours, minutes, seconds] = timeStr.split(':').map(Number);
            return hours * 3600 + minutes * 60 + seconds;
        }
        
        let totalSeconds = 0;
        let monthStr = month.toString().padStart(2, '0');
        
        for (let line of lines) {
            let columns = line.split(',');
            if (columns[0] === driverID) {
                let dateMonth = columns[2].split('-')[1];
                if (dateMonth === monthStr) {
                    totalSeconds += timeToSeconds(columns[7]);
                }
            }
        }
        
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
    } catch (error) {
        return "00:00:00";
    }
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    try {
        let rateContent = fs.readFileSync(rateFile, 'utf8');
        let rateLines = rateContent.trim().split('\n').filter(line => line.trim() !== '');
        
        let dayOff = null;
        for (let line of rateLines) {
            let columns = line.split(',');
            if (columns[0] === driverID) {
                dayOff = columns[1];
                break;
            }
        }
        
        if (!dayOff) {
            return "00:00:00";
        }
        
        let shiftContent = fs.readFileSync(textFile, 'utf8');
        let shiftLines = shiftContent.trim().split('\n').filter(line => line.trim() !== '');
        
        const dayMap = {
            'Sunday': 0,
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6
        };
        
        let dayOffNum = dayMap[dayOff];
        let monthNum = parseInt(month);
        let requiredSeconds = 0;
        
        for (let line of shiftLines) {
            let columns = line.split(',');
            if (columns[0] === driverID) {
                let [year, mon, day] = columns[2].split('-').map(Number);
                if (mon === monthNum) {
                    let date = new Date(year, mon - 1, day);
                    let dayOfWeek = date.getDay();
                    
                    if (dayOfWeek === dayOffNum) {
                        continue;
                    }
                    
                    const isEidPeriod = year === 2025 && mon === 4 && day >= 10 && day <= 30;
                    const dailyQuotaSeconds = isEidPeriod ? 6 * 3600 : 8 * 3600 + 24 * 60;
                    
                    requiredSeconds += dailyQuotaSeconds;
                }
            }
        }
        
        requiredSeconds -= bonusCount * 2 * 3600;
        requiredSeconds = Math.max(0, requiredSeconds);
        
        let hours = Math.floor(requiredSeconds / 3600);
        let minutes = Math.floor((requiredSeconds % 3600) / 60);
        let seconds = requiredSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
    } catch (error) {
        return "00:00:00";
    }
}

function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    try {
        let rateContent = fs.readFileSync(rateFile, 'utf8');
        let rateLines = rateContent.trim().split('\n').filter(line => line.trim() !== '');
        
        let basePay = 0;
        let tier = 0;
        
        for (let line of rateLines) {
            let columns = line.split(',');
            if (columns[0] === driverID) {
                basePay = parseInt(columns[2]);
                tier = parseInt(columns[3]);
                break;
            }
        }
        
        function timeToMinutes(timeStr) {
            let [hours, minutes, seconds] = timeStr.split(':').map(Number);
            return hours * 60 + minutes + seconds / 60;
        }
        
        let actualMinutes = timeToMinutes(actualHours);
        let requiredMinutes = timeToMinutes(requiredHours);
        
        if (actualMinutes >= requiredMinutes) {
            return basePay;
        }
        
        let missingMinutes = requiredMinutes - actualMinutes;
        
        const allowedMissing = {
            1: 50 * 60,
            2: 20 * 60,
            3: 10 * 60,
            4: 3 * 60
        };
        
        let allowedMinutes = allowedMissing[tier] || 0;
        let billableMissingMinutes = Math.max(0, missingMinutes - allowedMinutes);
        let billableMissingHours = Math.floor(billableMissingMinutes / 60);
        let deductionRatePerHour = Math.floor(basePay / 185);
        let salaryDeduction = billableMissingHours * deductionRatePerHour;
        let netPay = basePay - salaryDeduction;
        
        return netPay;
        
    } catch (error) {
        return 0;
    }
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};