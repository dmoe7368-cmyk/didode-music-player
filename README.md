# MelodyFlow Music Player

## Setup (GitHub Pages / any static host)
1. ဒီ folder အားလုံးကို GitHub repo ထဲ upload လုပ်ပါ (index.html ကို root မှာ ထားပါ)
2. GitHub → Settings → Pages → Deploy from branch → main ကို ရွေးပါ
3. သွားရမည့် Website link ရလာပါမယ်

## Google Drive Songs
- `js/config.js` ထဲမှာ folderId နှင့် apiKey ကို ထည့်ပြီးသားပါ
- Drive folder ထဲက file name များကို **1, 2, 3 ... 150** ဆိုပြီး နံပါတ်ဖြင့် အမည်ပေးပါ (extension ပါလည်းရပါတယ်၊ ဥပမာ 23.mp3)
- Drive folder ကို **"Anyone with the link can view"** အဖြစ် Share ထားရပါမယ် (Public)
- Songs 1-50 → Cover A, 51-100 → Cover B, 101-150 → Cover C အလိုအလျောက် သတ်မှတ်ပေးပါလိမ့်မယ်

## Cover Images ပြောင်းချင်ရင်
`assets/cover-a.svg`, `cover-b.svg`, `cover-c.svg` ဖိုင်များကို
မိမိ ကြိုက်နှစ်သက်ရာ .jpg / .png ဖြင့် အစားထိုးပြီး
`js/config.js` ထဲက `COVER_GROUPS` image path ကို update လုပ်ပါ။

## Local Upload
Library screen ရဲ့ "+" ခလုတ်ကနေ device ထဲက သီချင်းများကို တိုက်ရိုက် Upload လုပ်နိုင်ပါတယ် (browser session အတွင်းသာ)

## Note on API Key Security
Client-side JS ထဲမှာ API Key ပါနေတာမို့ Google Cloud Console →
Credentials → API key restrictions မှာ:
- Application restriction: HTTP referrers (သင့် domain ထည့်ပါ)
- API restriction: Google Drive API တစ်ခုတည်းသာ ခွင့်ပြုပါ
