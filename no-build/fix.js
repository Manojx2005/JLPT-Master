const fs = require('fs');
let txt = fs.readFileSync('features.js', 'utf8');

// Fix "Let alone; not to mention" (～はおろか, ～はもとより) -> မဆိုထားနဲ့
txt = txt.replace(/meaning_my: 'ဆိုတာထက်'/g, "meaning_my: 'မဆိုထားနဲ့'");

// Fix "Rather than" (～くらいなら) -> ထက်စာရင်
txt = txt.replace(/pattern: '～くらいなら', meaning: 'Rather than', meaning_vn: 'Nếu phải... thì thà', meaning_my: 'ဆိုရင်တော့'/g, "pattern: '～くらいなら', meaning: 'Rather than', meaning_vn: 'Nếu phải... thì thà', meaning_my: 'ထက်စာရင်'");

fs.writeFileSync('features.js', txt);
console.log('Fixed translations');
