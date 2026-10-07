(function(root){
  const works = [
  {
    "id": "pictures",
    "title": "Pictures at an Exhibition",
    "composer": "Mussorgsky · orchestrated by Ravel",
    "part": "Violin II",
    "durationLabel": "34 min",
    "summary": "3 movements have approximate bar following. The others have movement jumps.",
    "primary": {
      "label": "Open piece",
      "bundle": "research/learn/pictures-at-an-exhibition/practice-ready/pairing.json"
    },
    "movements": [
      {
        "id": "promenade-1",
        "label": "Promenade I",
        "status": "bar-following",
        "time": 4,
        "firstBarTime": 5.4675
      },
      {
        "id": "gnomus",
        "label": "Gnomus",
        "status": "bar-following",
        "time": 112,
        "firstBarTime": 112.7622
      },
      {
        "id": "promenade-2",
        "label": "Promenade II",
        "status": "bar-following",
        "time": 254,
        "firstBarTime": 254.96
      },
      {
        "id": "old-castle",
        "label": "Il vecchio castello",
        "status": "navigation-only",
        "time": 318
      },
      {
        "id": "promenade-3",
        "label": "Promenade III",
        "status": "navigation-only",
        "time": 600
      },
      {
        "id": "tuileries",
        "label": "Tuileries",
        "status": "navigation-only",
        "time": 628
      },
      {
        "id": "bydlo",
        "label": "Bydlo",
        "status": "navigation-only",
        "time": 690
      },
      {
        "id": "promenade-4",
        "label": "Promenade IV",
        "status": "navigation-only",
        "time": 885
      },
      {
        "id": "ballet",
        "label": "Ballet des poussins dans leurs coques",
        "status": "navigation-only",
        "time": 924
      },
      {
        "id": "samuel",
        "label": "Samuel Goldenberg und Schmuyle",
        "status": "navigation-only",
        "time": 1002
      },
      {
        "id": "limoges",
        "label": "Limoges · Le Marché",
        "status": "navigation-only",
        "time": 1156
      },
      {
        "id": "catacombs",
        "label": "Catacombs · Violin II tacet",
        "status": "navigation-only",
        "time": 1236
      },
      {
        "id": "cum-mortuis",
        "label": "Cum mortuis in lingua mortua",
        "status": "navigation-only",
        "time": 1368
      },
      {
        "id": "baba-yaga",
        "label": "La Cabane sur des pattes de poule · Baba-Yaga",
        "status": "navigation-only",
        "time": 1501
      },
      {
        "id": "great-gate",
        "label": "La grande porte de Kiev",
        "status": "navigation-only",
        "time": 1704
      }
    ],
    "versions": [
      {
        "label": "Promenade I only",
        "bundle": "research/learn/pictures-at-an-exhibition/promenade-1-verification/pairing.json"
      },
      {
        "label": "Gnomus only · approximate trial",
        "bundle": "research/learn/pictures-at-an-exhibition/gnomus-codex-review/pairing.json"
      },
      {
        "label": "Promenade II only",
        "bundle": "research/learn/pictures-at-an-exhibition/promenade-2-verification/pairing-v2.json"
      },
      {
        "label": "Chapter navigation only",
        "bundle": "research/learn/pictures-at-an-exhibition/player/pairing.json"
      }
    ]
  },
  {
    "id": "liadov-baba-yaga",
    "title": "Baba Yaga, Op. 56",
    "composer": "Anatoly Liadov",
    "part": "Violin II",
    "durationLabel": "4 min",
    "summary": "Bar following uses the existing score-video timing.",
    "primary": {
      "label": "Open piece",
      "bundle": "research/learn/baba-yaga-blind/player/video-comparison.json"
    },
    "movements": [],
    "versions": []
  }
];
  if(typeof module==='object' && module.exports) module.exports=works;
  if(root) root.OrchestraCatalogData=works;
})(typeof window!=='undefined'?window:null);

