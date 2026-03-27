/**
 * Hindi language templates for rule-based insight generation.
 *
 * Mirrors the English builders in generateInsight.js but with natural
 * conversational Hindi. Trigger/emotion labels are translated here for
 * Hindi prose composition — the frontend separately translates UI labels
 * via its own i18n JSON files.
 */

// ── Hindi label maps ─────────────────────────────────────────────────────────

const TRIGGER_HI = {
  work: "काम",
  family: "परिवार",
  partner: "पार्टनर",
  social: "सामाजिक जीवन",
  alone: "अकेले समय",
  exercise: "व्यायाम",
  travel: "यात्रा",
  health: "स्वास्थ्य",
  money: "पैसा",
};

const EMOTION_HI = {
  calm: "शांत",
  neutral: "सामान्य",
  anxious: "चिंतित",
  frustrated: "निराश",
  energized: "ऊर्जावान",
};

export function triggerHi(trigger) {
  return TRIGGER_HI[trigger] || trigger;
}

export function emotionHi(emotion) {
  return EMOTION_HI[emotion] || emotion;
}

function triggerListHi(triggers) {
  const items = (triggers || []).map(triggerHi);
  if (items.length === 0) return "कई क्षेत्रों";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} और ${items[1]}`;
  return items.slice(0, -1).join(", ") + " और " + items[items.length - 1];
}

// ── Micro experiments (Hindi) ────────────────────────────────────────────────

export const MICRO_EXPERIMENTS_HI = {
  work: [
    "इस हफ़्ते एक शाम तय समय पर लैपटॉप बंद करें और ध्यान दें कि कैसा लगता है।",
    "जिस काम को टाल रहे हैं, उसे बस 10 मिनट ध्यान से करें।",
    "अगली मीटिंग से पहले तीन गहरी साँसें लें और एक लक्ष्य तय करें।",
  ],
  family: [
    "इस हफ़्ते परिवार की बातचीत में एक भावना ज़ोर से कहें।",
    "किसी पारिवारिक मिलन से पहले, एक सीमा तय करें जो आप रखना चाहते हैं।",
    "किसी परिवार के सदस्य को एक छोटा नोट लिखें, भले ही भेजें या नहीं।",
  ],
  partner: [
    "अपने पार्टनर से एक खुला सवाल पूछें और बस सुनें।",
    "बातचीत में जब प्रतिक्रिया आए, तो जवाब देने से पहले रुकें।",
    "आज अपने पार्टनर के बारे में एक बात लिखें जो आपको अच्छी लगती है।",
  ],
  social: [
    "इस हफ़्ते एक दावत को मना करें और देखें आपकी ऊर्जा पर क्या असर पड़ता है।",
    "अगली सामाजिक मुलाकात के बाद, एक शब्द में बताएँ कैसा लगा।",
    "किसी से बात करें जिनसे काफ़ी समय से बात नहीं हुई।",
  ],
  alone: [
    "इस हफ़्ते 30 मिनट अकेले बिना स्क्रीन के बिताएँ।",
    "अकेले समय के बीच रुककर पहचानें कि उस पल क्या महसूस हो रहा है।",
    "ध्यान दें कि दिन के अलग-अलग समय में अकेलापन आपको ऊर्जा देता है या थकाता है।",
  ],
  exercise: [
    "अगले वर्कआउट से पहले और बाद में अपना मूड लॉग करें और तुलना करें।",
    "इस हफ़्ते एक कठिन सेशन की जगह 20 मिनट की सैर करें।",
    "उस समय स्ट्रेचिंग करें जब आप आमतौर पर नहीं करते।",
  ],
  travel: [
    "अगली यात्रा पर ध्यान दें कि किस पल माहौल ने आपका मूड बदल दिया।",
    "यात्रा से पहले लिखें कि आप अंत तक कैसा महसूस करना चाहते हैं।",
    "किसी नई जगह पहुँचकर पाँच मिनट चुपचाप आसपास देखें।",
  ],
  health: [
    "तीन दिन एक स्वास्थ्य आदत ट्रैक करें और साथ में मूड भी नोट करें।",
    "आज रात सोने से पहले 10 मिनट स्क्रीन की जगह शांति में बिताएँ।",
    "जो स्वास्थ्य चिंता टाल रहे हैं, उसके लिए एक छोटा कदम उठाएँ।",
  ],
  money: [
    "इस हफ़्ते की तीन खरीदारी को 'कैसा लगा' पैमाने पर आँकें।",
    "अगली गैर-ज़रूरी खरीदारी से पहले 24 घंटे रुकें।",
    "एक सब्सक्रिप्शन जिसके बारे में सोच रहे हैं, उसे 5 मिनट रिव्यू करें।",
  ],
};

// ── Summary builders (Hindi) ─────────────────────────────────────────────────

export function buildTooEarlySummaryHi() {
  return "आप अभी शुरुआत कर रहे हैं। जो भी पल आप लॉग करते हैं, वो हमें आपको समझने में मदद करता है। कुछ और लॉग करें और हम पैटर्न पहचानना शुरू करेंगे।";
}

export function buildLowSummaryHi(report, firstName) {
  const n = report.dataQuality.totalMoments;
  const opener = firstName ? `${firstName}, आपने` : "आपने";
  if (report.topTrigger) {
    return `${opener} अब तक ${n} पल लॉग किए हैं, और ${triggerHi(report.topTrigger)} सबसे ज़्यादा आया है। जारी रखें — कुछ और दिनों में आपके पैटर्न स्पष्ट होने लगेंगे।`;
  }
  return `${n} पल कई क्षेत्रों में लॉग हुए हैं। अभी कोई एक विषय सामने नहीं आया, जो ठीक है। थोड़ा और डेटा आने पर पैटर्न बनेंगे।`;
}

export function buildEmergingSummaryHi(report, firstName) {
  const parts = [];
  const bm = report.baselineMetrics;

  if (report.topTrigger) {
    parts.push(`${firstName ? firstName + ", " : ""}इस हफ़्ते ${triggerHi(report.topTrigger)} आपके दिमाग़ में सबसे ज़्यादा रहा।`);
  } else if (report.tiedTriggers?.length) {
    parts.push(`${firstName ? firstName + ", आपका" : "आपका"} हफ़्ता ${triggerListHi(report.tiedTriggers)} के बीच बँटा रहा।`);
  }

  if (report.topEmotion) {
    parts.push(`इस हफ़्ते आपने ज़्यादातर ${emotionHi(report.topEmotion)} महसूस किया।`);
  }

  if (report.regulators.length) {
    const r = report.regulators[0];
    parts.push(`अच्छी बात: ${triggerHi(r.trigger)} आपको ${emotionHi(r.emotion)} महसूस कराता लगता है। इसे बनाए रखना ज़रूरी है।`);
  }

  if (bm?.drift?.direction === "declining") {
    parts.push("इस हफ़्ते आपकी भावनात्मक टोन आपके सामान्य से थोड़ी नीचे रही।");
  } else if (bm?.drift?.direction === "improving") {
    parts.push("इस हफ़्ते आपकी हालत आपके सामान्य से थोड़ी बेहतर लग रही है।");
  }

  return parts.join(" ");
}

export function buildModerateSummaryHi(report, firstName, sp, ranked, rel, bm) {
  const name = firstName ? firstName + ", " : "";

  let s1;
  if (sp.volatility === "low" && sp.dominantEmotion === "neutral") {
    s1 = sp.isFlattening
      ? `${name}आपका हफ़्ता ऊपर से स्थिर दिखा, सामान्य सबसे ज़्यादा आया।`
      : `${name}आपका हफ़्ता स्थिर रहा, सामान्य सबसे आम भावना रही।`;
  } else if (sp.volatility === "low") {
    s1 = `${name}इस हफ़्ते चीज़ें स्थिर रहीं, ${emotionHi(report.topEmotion || "एक जैसी भावना")} सबसे ज़्यादा दिखी।`;
  } else if (report.topTrigger) {
    s1 = `${name}इस हफ़्ते ${triggerHi(report.topTrigger)} सबसे ज़्यादा आया।`;
  } else {
    s1 = `${name}आपका ध्यान ${triggerListHi(report.tiedTriggers)} में बँटा रहा।`;
  }

  let s2;
  if (rel === "contrast") {
    if (sp.isFlattening) {
      s2 = "अंदर से, आपकी भावनात्मक प्रतिक्रियाएँ सामान्य की तरफ़ सिमट रही हैं, हफ़्ते में कम बदलाव दिखा।";
    } else if (sp.volatility === "low" && (sp.drift === "slight_negative" || sp.drift === "strong_negative")) {
      s2 = "ऊपर से स्थिर लगता है, लेकिन आपकी बेसलाइन के नीचे हल्का बदलाव हुआ है।";
    } else if (report.frictionZones?.length) {
      const f = report.frictionZones[0];
      s2 = `${triggerHi(f.trigger)} अक्सर आपको ${emotionHi(f.emotion)} छोड़ता रहा (${f.count}×)।`;
    } else {
      s2 = "ऊपर से स्थिर लगने के बावजूद, कुछ संकेत एक बारीक बदलाव बता रहे हैं।";
    }
  } else {
    if (report.frictionZones?.length) {
      const f = report.frictionZones[0];
      s2 = `${triggerHi(f.trigger)} ${f.count <= 2 ? "कभी-कभी" : "अक्सर"} आपको ${emotionHi(f.emotion)} महसूस कराता रहा (${f.count}×)।`;
    } else if (bm?.stateOfMind) {
      s2 = `आप ${bm.stateOfMind} हैं।`;
    } else {
      s2 = sp.volatility === "low"
        ? "आपकी भावनाओं में कम उतार-चढ़ाव रहा।"
        : "इस हफ़्ते कुछ भावनात्मक उतार-चढ़ाव रहा, हालाँकि कोई बड़ी बात नहीं दिखी।";
    }
  }

  let s3;
  if (report.regulators?.length) {
    const r = report.regulators[0];
    if (sp.isFlattening) {
      s3 = `${triggerHi(r.trigger)} अभी भी आपको ${emotionHi(r.emotion)} दे रहा है, लेकिन कुल मिलाकर टोन नहीं बदली।`;
    } else {
      s3 = `${triggerHi(r.trigger)} आपको ${emotionHi(r.emotion)} महसूस कराता रहा, जो एक अच्छा सहारा है।`;
    }
  } else if (bm?.stateOfMind && !s2.includes(bm.stateOfMind)) {
    s3 = `कुल मिलाकर, आप ${bm.stateOfMind} हैं।`;
  } else {
    s3 = "कोई एक पैटर्न हावी नहीं रहा, तो ये देखने का मौका है कि आपका हफ़्ता क्या आकार देता है।";
  }

  return `${s1} ${s2} ${s3}`;
}

export function buildStrongSummaryHi(report, firstName, sp, ranked, rel, bm) {
  const name = firstName ? firstName + ", " : "";

  let s1;
  if (sp.volatility === "low" && sp.dominantEmotion === "neutral") {
    s1 = sp.isFlattening
      ? `${name}आपका हफ़्ता ऊपर से शांत दिखा, लेकिन सामान्य हावी रहा और भावनात्मक रेंज कम रही।`
      : `${name}आपका हफ़्ता शांत और ज़्यादातर सामान्य रहा, बिना ज़्यादा भावनात्मक हलचल के।`;
  } else if (sp.volatility === "high") {
    s1 = `${name}इस हफ़्ते भावनाओं में काफ़ी उतार-चढ़ाव रहा।`;
  } else if (report.topTrigger) {
    s1 = `${name}इस हफ़्ते ${triggerHi(report.topTrigger)} मुख्य विषय रहा।`;
  } else {
    s1 = `${name}आपका हफ़्ता ${triggerListHi(report.tiedTriggers)} को छुआ, कोई एक हावी नहीं रहा।`;
  }

  let s2;
  if (rel === "contrast") {
    if (sp.isFlattening) {
      s2 = "आपकी भावनात्मक प्रतिक्रियाएँ हफ़्ते में सामान्य की तरफ़ सिमटती गईं, जो बताता है कि अनुभवों पर प्रतिक्रिया कम हो रही है।";
    } else if (sp.volatility === "low" && (sp.drift === "slight_negative" || sp.drift === "strong_negative")) {
      const adj = sp.drift === "slight_negative" ? "हल्की गिरावट" : "स्पष्ट गिरावट";
      s2 = `ऊपर से सब स्थिर लगता है, लेकिन बेसलाइन से ${adj} दिखी है।`;
    } else if (ranked.anchor && sp.drift !== "positive" && report.frictionZones?.length) {
      const f = report.frictionZones[0];
      s2 = `${triggerHi(f.trigger)} और ${emotionHi(f.emotion)} बार-बार साथ दिखे (${f.count}×)। ये ध्यान देने लायक है।`;
    } else {
      s2 = "ऊपर से स्थिर लगने के बावजूद, कुछ संकेत एक बारीक बदलाव बता रहे हैं।";
    }
  } else {
    if (report.frictionZones?.length) {
      const f = report.frictionZones[0];
      s2 = `${triggerHi(f.trigger)} और ${emotionHi(f.emotion)} ${sp.triggerStrength === "weak" ? "साथ दिखे" : "बार-बार साथ दिखे"} (${f.count}×)। ${sp.triggerStrength === "weak" ? "ध्यान दें।" : "ये एक पैटर्न है जो ध्यान माँगता है।"}`;
    } else if (bm?.stateOfMind) {
      s2 = `अभी, आप ${bm.stateOfMind} हैं।`;
    } else {
      s2 = "कोई स्पष्ट बदलाव नहीं दिखा, जो स्थिरता की निशानी हो सकती है।";
    }
  }

  let s3;
  if (report.regulators?.length && !s2.includes(triggerHi(report.regulators[0].trigger))) {
    const r = report.regulators[0];
    if (sp.isFlattening) {
      s3 = `${triggerHi(r.trigger)} अभी भी आपको ${emotionHi(r.emotion)} दे रहा है, लेकिन कुल टोन नहीं बदली।`;
    } else {
      s3 = `${triggerHi(r.trigger)} ने ${r.count >= 4 ? "लगातार" : "आम तौर पर"} आपको ${emotionHi(r.emotion)} महसूस कराया।`;
    }
  } else if (bm?.recoveryLatency) {
    s3 = `जब हालात गिरते हैं, आप ${bm.recoveryLatency.label} रिकवर करते हैं।`;
  } else if (bm?.stateOfMind && !s2.includes(bm.stateOfMind)) {
    s3 = `कुल मिलाकर, आप ${bm.stateOfMind} हैं।`;
  } else {
    s3 = "अब काफ़ी डेटा है कि आपके हफ़्ते को क्या आकार देता है, ये समझ आने लगे।";
  }

  return `${s1} ${s2} ${s3}`;
}

// ── Structured fields (Hindi) ────────────────────────────────────────────────

export function buildWhatWorkingHi(items) {
  if (!items) return null;
  return items.map((item) => {
    if (item.trigger && item.emotion) {
      return { ...item, text: `${triggerHi(item.trigger)} आपको ${emotionHi(item.emotion)} महसूस कराता है` };
    }
    // Generic items — translate known patterns
    if (item.text.includes("pretty steady")) return { ...item, text: "आपकी भावनाएँ इस हफ़्ते काफ़ी स्थिर रही हैं" };
    if (item.text.includes("great stability")) return { ...item, text: "आप अपनी भावनात्मक बेसलाइन के करीब बने हुए हैं। ये बहुत अच्छी स्थिरता है" };
    if (item.text.includes("trending above")) return { ...item, text: "आपकी अंतर्निहित भावनात्मक स्थिति बेसलाइन से ऊपर जा रही है" };
    return item;
  });
}

export function buildWhereToFocusHi(items) {
  if (!items) return null;
  return items.map((item) => {
    if (item.trigger && item.emotion) {
      const freq = item.count <= 2 ? "कभी-कभी" : "अक्सर";
      return { ...item, text: `${triggerHi(item.trigger)} ${freq} आपको ${emotionHi(item.emotion)} छोड़ता है — ध्यान दें` };
    }
    if (item.text.includes("subtle dip")) return { ...item, text: "आपकी भावनात्मक बेसलाइन में हल्की गिरावट आई है" };
    if (item.text.includes("dipped below")) return { ...item, text: "इस हफ़्ते आपकी भावनात्मक टोन बेसलाइन से नीचे गई है" };
    if (item.text.includes("narrowing toward neutral")) return { ...item, text: "आपकी भावनात्मक रेंज सामान्य की तरफ़ सिमट रही है, दिन-प्रतिदिन कम बदलाव" };
    if (item.text.includes("bounce back")) return { ...item, text: "मुश्किल दौर के बाद सामान्य होने में कुछ दिन लग रहे हैं" };
    if (item.text.includes("more is going on")) return { ...item, text: "आपके व्यवहार पैटर्न बताते हैं कि बताई गई भावनाओं से ज़्यादा कुछ हो रहा है" };
    if (item.text.includes("recovery may not be complete")) return { ...item, text: "स्कोर सामान्य दिखते हैं, लेकिन अंदरूनी संकेत बताते हैं कि रिकवरी पूरी नहीं हुई" };
    if (item.text.includes("deeper signals are diverging")) return { ...item, text: "ऊपर से सब ठीक लगता है, लेकिन कुछ गहरे संकेत अलग दिशा में हैं — ध्यान दें" };
    if (item.text.includes("carrying over")) return { ...item, text: "एक संदर्भ की भावनाएँ दूसरे असंबंधित संदर्भों में भी दिख रही हैं" };
    return item;
  });
}

export function buildActionableDirectionHi(report, sp, bm) {
  if (sp.crashRisk) return "ऊपर से सब स्थिर दिखता है लेकिन गहरे संकेत अलग हो रहे हैं। आराम को प्राथमिकता दें और अपने आप से बात करें।";
  if (sp.falseRecovery) return "स्कोर वापस आ गए हैं लेकिन अंदरूनी पैटर्न अभी हल नहीं हुआ। मुश्किल परिस्थितियों में धीरे-धीरे वापस जाएँ।";
  if (sp.maskingLevel === "high") return "आपकी लॉग की गई भावनाओं से ज़्यादा कुछ हो रहा है। बिना फ़िल्टर किए ज़्यादा खुलकर लॉग करने की कोशिश करें।";
  if (bm?.drift?.direction === "declining") {
    const helper = report.regulators?.[0] ? triggerHi(report.regulators[0].trigger) : "जो मदद करता है उस पर";
    return `आपकी बेसलाइन गिर रही है। ${helper} पर झुकें।`;
  }
  if (sp.isFlattening) return "आपकी भावनात्मक रेंज सिकुड़ रही है। कुछ नया करके देखें कि क्या बदलता है।";
  if (report.regulators?.length && bm?.stability?.score >= 0.6) return `चीज़ें स्थिर हैं। ${triggerHi(report.regulators[0].trigger)} को अपने हफ़्ते में बनाए रखें।`;
  return null;
}

export function baselineSummaryHi(bm) {
  if (!bm?.baseline?.reliable) return null;
  let text = `आपकी भावनात्मक बेसलाइन ${bm.baseline.label} के करीब है।`;
  if (bm.drift) {
    text += ` इस हफ़्ते आप अपने सामान्य से ${bm.drift.label} हैं।`;
  }
  return text;
}

export function appendTagContextHi(summary, report) {
  const tagFreq = report.tagFrequency;
  if (!tagFreq || !Object.keys(tagFreq).length) return summary;
  const sorted = Object.entries(tagFreq).sort(([, a], [, b]) => b - a);
  const topTag = sorted[0];
  if (!topTag || topTag[1] < 2) return summary;
  return `${summary} ख़ास बात: "${topTag[0]}" आपके पलों में ${topTag[1]} बार आया।`;
}
