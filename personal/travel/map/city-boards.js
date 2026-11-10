// Themed ranking boards for the 世界主要城市 collection. They are a way in,
// not a filter of who counts: a city on no board is still in the catalogue and
// is reached by search. Every entry names a catalogue city id
// (`slug(English name)-iso`); a board only lists cities the atlas has, so an
// official rank can skip a number where that city is not in the catalogue.
//
// Entry: [rank, city id, short note]. `compute` boards are derived from the
// catalogue coordinates at load instead of listing entries.
// `kind` says what the order means: 'ranking' (a published ranking, cite the
// edition), 'record' (a measured or historical fact), or 'editorial' (our own
// pick, captioned as such).
window.TravelAtlasCityBoards = [
  {
    id:'liveable', label:'最宜居城市', en:'MOST LIVEABLE', kind:'ranking', source:'EIU 全球宜居指數 2024',
    entries:[
      [1,'vienna-at',''],[2,'copenhagen-dk',''],[3,'zurich-ch',''],[4,'melbourne-au',''],[5,'calgary-ca',''],
      [6,'geneva-ch',''],[7,'sydney-au',''],[8,'vancouver-ca',''],[9,'osaka-jp','並列第 9'],[9,'auckland-nz','並列第 9']
    ]
  },
  {
    id:'top100', label:'百大旅遊城市', en:'TOP 100 CITY DESTINATIONS', kind:'ranking', source:'Euromonitor 百大城市目的地 2025 · 依國際旅客選出、綜合吸引力排名',
    entries:[
      [1,'paris-fr',''],[2,'madrid-es',''],[3,'tokyo-jp',''],[4,'rome-it',''],[5,'milan-it',''],
      [6,'new-york-us',''],[7,'amsterdam-nl',''],[8,'barcelona-es',''],[9,'singapore-sg',''],[10,'seoul-kr',''],
      [11,'osaka-jp',''],[12,'dubai-ae',''],[13,'los-angeles-us',''],[14,'istanbul-tr',''],[15,'taipei-tw',''],
      [16,'berlin-de',''],[17,'hong-kong-hk',''],[18,'london-gb',''],[19,'kyoto-jp',''],[20,'bangkok-th','旅客人數第 1'],
      [21,'orlando-us',''],[22,'munich-de',''],[23,'florence-it',''],[24,'kuala-lumpur-my',''],[25,'athens-gr',''],
      [26,'lisbon-pt',''],[27,'las-vegas-us',''],[28,'sydney-au',''],[29,'melbourne-au',''],[30,'venice-it',''],
      [31,'vienna-at',''],[32,'prague-cz',''],[33,'dublin-ie',''],[34,'shanghai-cn',''],[35,'san-francisco-us',''],
      [36,'miami-us',''],[37,'frankfurt-de',''],[38,'copenhagen-dk',''],[39,'toronto-ca',''],[40,'washington-d-c-us',''],
      [41,'guangzhou-cn',''],[42,'beijing-cn',''],[43,'hamburg-de',''],[44,'sao-paulo-br',''],[45,'pattaya-th','芭達雅－春武里'],
      [46,'shenzhen-cn',''],[47,'phuket-th',''],[48,'antalya-tr',''],[49,'palma-de-mallorca-es','馬略卡島'],[50,'sapporo-jp',''],
      [51,'seville-es',''],[52,'ho-chi-minh-city-vn',''],[53,'nice-fr',''],[54,'mexico-city-mx',''],[55,'zurich-ch',''],
      [56,'busan-kr',''],[57,'oslo-no',''],[58,'vancouver-ca',''],[59,'brussels-be',''],[60,'budapest-hu',''],
      [61,'macau-mo',''],[62,'valencia-es',''],[63,'helsinki-fi',''],[64,'fukuoka-jp',''],[65,'honolulu-us',''],
      [66,'abu-dhabi-ae',''],[67,'stockholm-se',''],[68,'porto-pt',''],[69,'rhodes-gr','羅德島'],[70,'rio-de-janeiro-br',''],
      [71,'verona-it',''],[72,'hanoi-vn',''],[73,'doha-qa',''],[74,'new-delhi-in','德里'],[75,'bologna-it',''],
      [76,'riyadh-sa',''],[77,'montreal-ca',''],[78,'warsaw-pl',''],[79,'cancun-mx',''],[80,'buenos-aires-ar',''],
      [81,'johor-bahru-my',''],[82,'heraklion-gr','克里特島'],[83,'bogota-co',''],[84,'lima-pe',''],[85,'edinburgh-gb',''],
      [86,'nha-trang-vn',''],[87,'medina-sa',''],[88,'santiago-cl',''],[89,'thessaloniki-gr',''],[90,'jakarta-id',''],
      [91,'mecca-sa',''],[92,'krakow-pl',''],[93,'punta-cana-do',''],[94,'tbilisi-ge',''],[95,'marrakech-ma',''],
      [96,'denpasar-id','峇里島'],[97,'cairo-eg',''],[98,'zhuhai-cn',''],[99,'vilnius-lt',''],[100,'mugla-tr','博德魯姆、費特希耶一帶']
    ]
  },
  {
    id:'olympics', label:'夏季奧運主辦城市', en:'SUMMER OLYMPIC HOSTS', kind:'record', source:'依首次主辦年份 · 含已確定的 2028、2032',
    entries:[
      [1,'athens-gr','1896 · 2004'],[2,'paris-fr','1900 · 1924 · 2024'],[3,'london-gb','1908 · 1948 · 2012'],[4,'stockholm-se','1912'],
      [5,'amsterdam-nl','1928'],[6,'los-angeles-us','1932 · 1984 · 2028'],[7,'berlin-de','1936'],[8,'helsinki-fi','1952'],
      [9,'melbourne-au','1956'],[10,'rome-it','1960'],[11,'tokyo-jp','1964 · 2020'],[12,'mexico-city-mx','1968'],
      [13,'munich-de','1972'],[14,'montreal-ca','1976'],[15,'moscow-ru','1980'],[16,'seoul-kr','1988'],
      [17,'barcelona-es','1992'],[18,'sydney-au','2000'],[19,'beijing-cn','2008'],[20,'rio-de-janeiro-br','2016'],
      [21,'brisbane-au','2032']
    ]
  },
  {
    id:'ancient', label:'千年古都', en:'ANCIENT CAPITALS', kind:'editorial', source:'編輯精選 · 附舊稱',
    entries:[
      [1,'xi-an-cn','長安'],[2,'rome-it','羅馬帝國'],[3,'athens-gr','古希臘城邦'],[4,'istanbul-tr','君士坦丁堡'],
      [5,'kyoto-jp','平安京'],[6,'beijing-cn','元明清'],[7,'cairo-eg','法蒂瑪王朝'],[8,'jerusalem-il','大衛之城'],
      [9,'cusco-pe','印加帝國'],[10,'mexico-city-mx','特諾奇提特蘭'],[11,'hanoi-vn','昇龍'],[12,'krakow-pl','波蘭王國']
    ]
  },
  {
    id:'islands', label:'海島城市', en:'ISLAND CITIES', kind:'editorial', source:'編輯精選 · 附所在島嶼',
    entries:[
      [1,'denpasar-id','峇里島'],[2,'phuket-th','普吉島'],[3,'male-mv','馬爾地夫'],[4,'honolulu-us','歐胡島'],
      [5,'naha-jp','沖繩本島'],[6,'papeete-pf','大溪地'],[7,'zanzibar-city-tz','尚吉巴'],[8,'cebu-city-ph','宿霧島'],
      [9,'suva-fj','維提島'],[10,'san-juan-pr','波多黎各']
    ]
  },
  {
    id:'altitude', label:'高海拔城市', en:'HIGHEST CITIES', kind:'record', source:'市中心海拔（約）',
    entries:[
      [1,'la-paz-bo','3,640 m'],[2,'cusco-pe','3,400 m'],[3,'quito-ec','2,850 m'],[4,'bogota-co','2,640 m'],
      [5,'addis-ababa-et','2,355 m'],[6,'mexico-city-mx','2,240 m'],[7,'nairobi-ke','1,795 m'],[8,'johannesburg-za','1,753 m'],
      [9,'denver-us','1,609 m'],[10,'kigali-rw','1,567 m']
    ]
  },
  { id:'north', label:'最北的城市', en:'FARTHEST NORTH', kind:'record', source:'依城市緯度', compute:'north', size:10 },
  { id:'south', label:'最南的城市', en:'FARTHEST SOUTH', kind:'record', source:'依城市緯度', compute:'south', size:10 }
];
