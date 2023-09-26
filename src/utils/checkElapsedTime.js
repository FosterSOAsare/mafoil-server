function checkElapsedTime(time, timeCheck) {
	let time1 = new Date(time);
	time1 = time1.getTime();
	let time2 = new Date();
	time2 = time2.getTime();

	let timeDiff = (time2 - time1) / 1000;
	return timeDiff > timeCheck;
}

module.exports = { checkElapsedTime };
