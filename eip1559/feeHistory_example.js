var sampleMin = 0.1;
var sampleMax = 0.3;
var maxTimeFactor = 10;
var extraTipRatio = 0.25;
var fallbackTip = 5e9;

function suggestFees() {
    var feeHistory = eth.feeHistory(300, "latest");
    var baseFee = feeHistory.BaseFee;
    var gasUsedRatio = feeHistory.GasUsedRatio;

    baseFee[baseFee.length - 1] *= 9 / 8;
    for (var i = gasUsedRatio.length - 1; i >= 0; i--) {
        if (gasUsedRatio[i] > 0.9) {
            baseFee[i] = baseFee[i + 1];
        }
    }

    var order = [];
    for (var i = 0; i < baseFee.length; i++) {
        order.push(i);
    }
    order.sort(function compare(a, b) {
        var aa = baseFee[a];
        var bb = baseFee[b];
        if (aa < bb) {
            return -1;
        }
        if (aa > bb) {
            return 1;
        }
        return 0;
    })

    var tip = suggestTip(feeHistory.FirstBlock, gasUsedRatio);
    var result = [];
    var maxBaseFee = 0;
    for (var timeFactor = maxTimeFactor; timeFactor >= 0; timeFactor--) {
        var bf = suggestBaseFee(baseFee, order, timeFactor);
        var t = tip;
        if (bf > maxBaseFee) {
            maxBaseFee = bf;
        } else {
            t += (maxBaseFee - bf) * extraTipRatio;
        }
        result[timeFactor] = {
            maxFee: bf + t,
            maxPriorityFee: t
        };
    }
    return result;
}

function suggestTip(firstBlock, gasUsedRatio) {
    var ptr = gasUsedRatio.length - 1;
    var needBlocks = 5;
    var rewards = [];
    while (needBlocks > 0 && ptr >= 0) {
        var blockCount = maxBlockCount(gasUsedRatio, ptr, needBlocks);
        if (blockCount > 0) {
            var feeHistory = eth.feeHistory(blockCount, firstBlock + ptr, [10]);
            for (var i = 0; i < feeHistory.Reward.length; i++) {
                rewards.push(feeHistory.Reward[i][0]);
            }
            if (feeHistory.Reward.length < blockCount) {
                break;
            }
            needBlocks -= blockCount;
        }
        ptr -= blockCount + 1;
    }

    if (rewards.length == 0) {
        return fallbackTip;
    }
    rewards.sort();
    return rewards[Math.trunc(rewards.length / 2)];
}

function maxBlockCount(gasUsedRatio, ptr, needBlocks) {
    var blockCount = 0;
    while (needBlocks > 0 && ptr >= 0) {
        if (gasUsedRatio[ptr] < 0.1 || gasUsedRatio[ptr] > 0.9) {
            break;
        }
        ptr--;
        needBlocks--;
        blockCount++;
    }
    return blockCount;
}

function suggestBaseFee(baseFee, order, timeFactor) {
    if (timeFactor < 1e-6) {
        return baseFee[baseFee.length - 1];
    }
    var pendingWeight = (1 - Math.exp(-1 / timeFactor)) / (1 - Math.exp(-baseFee.length / timeFactor));
    var sumWeight = 0;
    var result = 0;
    var samplingCurveLast = 0;
    for (var i = 0; i < order.length; i++) {
        sumWeight += pendingWeight * Math.exp((order[i] - baseFee.length + 1) / timeFactor);
        var samplingCurveValue = samplingCurve(sumWeight);
        result += (samplingCurveValue - samplingCurveLast) * baseFee[order[i]];
        if (samplingCurveValue >= 1) {
            return result;
        }
        samplingCurveLast = samplingCurveValue;
    }
    return result;
}

function samplingCurve(sumWeight) {
    if (sumWeight <= sampleMin) {
        return 0;
    }
    if (sumWeight >= sampleMax) {
        return 1;
    }
    return (1 - Math.cos((sumWeight - sampleMin) * 2 * Math.PI / (sampleMax - sampleMin))) / 2;
}

