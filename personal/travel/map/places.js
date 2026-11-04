// Editorial city index: prominent destinations, not an exhaustive gazetteer.
// Park point coordinates represent a place in/near each park, never its boundary.
// Format: English | Traditional Chinese | ISO 3166-1 alpha-2 | latitude | longitude
const travelCities = `
Tokyo|東京|JP|35.676|139.650
Kyoto|京都|JP|35.012|135.768
Osaka|大阪|JP|34.693|135.502
Sapporo|札幌|JP|43.062|141.354
Fukuoka|福岡|JP|33.590|130.402
Naha|那霸|JP|26.213|127.680
Nagoya|名古屋|JP|35.182|136.907
Hiroshima|廣島|JP|34.385|132.455
Seoul|首爾|KR|37.566|126.978
Busan|釜山|KR|35.180|129.075
Taipei|台北|TW|25.033|121.565
Taichung|台中|TW|24.147|120.673
Kaohsiung|高雄|TW|22.627|120.301
Hong Kong|香港|HK|22.320|114.169
Macau|澳門|MO|22.199|113.544
Beijing|北京|CN|39.905|116.407
Shanghai|上海|CN|31.230|121.474
Shenzhen|深圳|CN|22.543|114.058
Guangzhou|廣州|CN|23.129|113.264
Chengdu|成都|CN|30.572|104.066
Xi’an|西安|CN|34.341|108.939
Singapore|新加坡|SG|1.290|103.852
Bangkok|曼谷|TH|13.756|100.502
Chiang Mai|清邁|TH|18.788|98.985
Phuket|普吉|TH|7.881|98.392
Kuala Lumpur|吉隆坡|MY|3.140|101.693
George Town|喬治市|MY|5.416|100.332
Hanoi|河內|VN|21.028|105.854
Ho Chi Minh City|胡志明市|VN|10.823|106.630
Da Nang|峴港|VN|16.054|108.202
Manila|馬尼拉|PH|14.600|120.984
Cebu City|宿霧市|PH|10.316|123.890
Jakarta|雅加達|ID|-6.209|106.846
Denpasar|登巴薩|ID|-8.650|115.216
Yogyakarta|日惹|ID|-7.795|110.369
Mumbai|孟買|IN|19.076|72.878
New Delhi|新德里|IN|28.614|77.209
Bengaluru|班加羅爾|IN|12.971|77.595
Kolkata|加爾各答|IN|22.573|88.364
Dubai|杜拜|AE|25.205|55.271
Abu Dhabi|阿布達比|AE|24.453|54.377
Doha|杜哈|QA|25.286|51.533
Istanbul|伊斯坦堡|TR|41.009|28.978
Jerusalem|耶路撒冷|IL|31.768|35.214
Tel Aviv|特拉維夫|IL|32.086|34.781
Kathmandu|加德滿都|NP|27.717|85.324
Phnom Penh|金邊|KH|11.557|104.928
Yangon|仰光|MM|16.841|96.173
Ulaanbaatar|烏蘭巴托|MN|47.922|106.919
Tbilisi|提比里斯|GE|41.716|44.827
Almaty|阿拉木圖|KZ|43.238|76.945
Colombo|可倫坡|LK|6.927|79.861
Malé|馬累|MV|4.175|73.509
London|倫敦|GB|51.507|-0.128
Paris|巴黎|FR|48.857|2.352
Berlin|柏林|DE|52.520|13.405
Munich|慕尼黑|DE|48.137|11.576
Rome|羅馬|IT|41.903|12.496
Milan|米蘭|IT|45.464|9.190
Venice|威尼斯|IT|45.440|12.315
Florence|佛羅倫斯|IT|43.770|11.255
Madrid|馬德里|ES|40.417|-3.703
Barcelona|巴塞隆納|ES|41.387|2.170
Lisbon|里斯本|PT|38.722|-9.139
Porto|波多|PT|41.149|-8.611
Amsterdam|阿姆斯特丹|NL|52.368|4.904
Brussels|布魯塞爾|BE|50.847|4.357
Vienna|維也納|AT|48.208|16.373
Prague|布拉格|CZ|50.076|14.438
Budapest|布達佩斯|HU|47.498|19.040
Warsaw|華沙|PL|52.230|21.012
Kraków|克拉科夫|PL|50.065|19.945
Copenhagen|哥本哈根|DK|55.676|12.568
Stockholm|斯德哥爾摩|SE|59.329|18.069
Oslo|奧斯陸|NO|59.913|10.752
Helsinki|赫爾辛基|FI|60.170|24.938
Reykjavík|雷克雅維克|IS|64.147|-21.942
Dublin|都柏林|IE|53.350|-6.260
Edinburgh|愛丁堡|GB|55.953|-3.189
Zürich|蘇黎世|CH|47.377|8.541
Geneva|日內瓦|CH|46.204|6.143
Athens|雅典|GR|37.984|23.728
Moscow|莫斯科|RU|55.756|37.617
Saint Petersburg|聖彼得堡|RU|59.935|30.325
Kyiv|基輔|UA|50.450|30.524
Dubrovnik|杜布羅夫尼克|HR|42.641|18.108
Split|斯普利特|HR|43.509|16.440
Bucharest|布加勒斯特|RO|44.427|26.103
Tallinn|塔林|EE|59.437|24.754
Riga|里加|LV|56.950|24.105
Nice|尼斯|FR|43.710|7.262
New York|紐約|US|40.713|-74.006
Boston|波士頓|US|42.361|-71.059
Washington, D.C.|華盛頓特區|US|38.907|-77.037
Philadelphia|費城|US|39.952|-75.164
Chicago|芝加哥|US|41.878|-87.630
Los Angeles|洛杉磯|US|34.054|-118.243
San Francisco|舊金山|US|37.775|-122.419
Seattle|西雅圖|US|47.606|-122.332
Portland|波特蘭|US|45.515|-122.678
San Diego|聖地牙哥|US|32.715|-117.162
Las Vegas|拉斯維加斯|US|36.170|-115.140
Miami|邁阿密|US|25.762|-80.192
New Orleans|紐奧良|US|29.951|-90.072
Austin|奧斯汀|US|30.267|-97.743
Houston|休士頓|US|29.760|-95.370
Denver|丹佛|US|39.739|-104.990
Salt Lake City|鹽湖城|US|40.760|-111.891
Anchorage|安克拉治|US|61.218|-149.900
Honolulu|檀香山|US|21.309|-157.858
Toronto|多倫多|CA|43.653|-79.383
Vancouver|溫哥華|CA|49.282|-123.120
Montréal|蒙特婁|CA|45.502|-73.567
Québec City|魁北克市|CA|46.813|-71.208
Ottawa|渥太華|CA|45.421|-75.698
Calgary|卡加利|CA|51.044|-114.071
Edmonton|艾德蒙頓|CA|53.546|-113.494
Victoria|維多利亞|CA|48.428|-123.366
Mexico City|墨西哥城|MX|19.433|-99.133
Guadalajara|瓜達拉哈拉|MX|20.673|-103.345
Cancún|坎昆|MX|21.162|-86.852
Havana|哈瓦那|CU|23.114|-82.366
San José|聖荷西|CR|9.928|-84.090
Panama City|巴拿馬城|PA|8.983|-79.520
Santo Domingo|聖多明哥|DO|18.486|-69.932
San Juan|聖胡安|PR|18.466|-66.106
São Paulo|聖保羅|BR|-23.550|-46.633
Rio de Janeiro|里約熱內盧|BR|-22.906|-43.173
Brasília|巴西利亞|BR|-15.793|-47.882
Buenos Aires|布宜諾斯艾利斯|AR|-34.603|-58.382
Santiago|聖地牙哥|CL|-33.449|-70.669
Lima|利馬|PE|-12.046|-77.043
Cusco|庫斯科|PE|-13.532|-71.968
Bogotá|波哥大|CO|4.711|-74.072
Medellín|麥德林|CO|6.245|-75.573
Cartagena|卡塔赫納|CO|10.391|-75.479
Quito|基多|EC|-0.181|-78.467
Montevideo|蒙特維多|UY|-34.902|-56.164
La Paz|拉巴斯|BO|-16.490|-68.119
Ushuaia|烏斯懷亞|AR|-54.801|-68.303
Cairo|開羅|EG|30.044|31.236
Alexandria|亞歷山卓|EG|31.200|29.918
Casablanca|卡薩布蘭卡|MA|33.574|-7.590
Marrakech|馬拉喀什|MA|31.630|-8.008
Rabat|拉巴特|MA|34.020|-6.841
Tunis|突尼斯|TN|36.807|10.182
Dakar|達卡|SN|14.693|-17.447
Accra|阿克拉|GH|5.603|-0.187
Lagos|拉各斯|NG|6.524|3.379
Abuja|阿布加|NG|9.077|7.398
Nairobi|奈洛比|KE|-1.287|36.817
Mombasa|蒙巴薩|KE|-4.043|39.668
Addis Ababa|阿迪斯阿貝巴|ET|9.029|38.747
Cape Town|開普敦|ZA|-33.925|18.424
Johannesburg|約翰尼斯堡|ZA|-26.204|28.047
Kigali|吉佳利|RW|-1.953|30.060
Zanzibar City|尚吉巴市|TZ|-6.165|39.199
Arusha|阿魯沙|TZ|-3.387|36.683
Sydney|雪梨|AU|-33.869|151.209
Melbourne|墨爾本|AU|-37.814|144.963
Brisbane|布里斯本|AU|-27.469|153.026
Perth|伯斯|AU|-31.953|115.861
Adelaide|阿得雷德|AU|-34.929|138.600
Canberra|坎培拉|AU|-35.281|149.130
Auckland|奧克蘭|NZ|-36.850|174.764
Wellington|威靈頓|NZ|-41.287|174.776
Christchurch|基督城|NZ|-43.532|172.636
Queenstown|皇后鎮|NZ|-45.031|168.662
Suva|蘇瓦|FJ|-18.141|178.441
Port Moresby|摩斯比港|PG|-9.443|147.180
Papeete|巴比提|PF|-17.551|-149.559
`.trim().split('\n').map(line => {
  const [en, zh, iso, lat, lon] = line.split('|');
  return { en, zh, iso, lat: Number(lat), lon: Number(lon) };
});

// The three arrays below are small, static indexes. Each row is:
// [stable code, English name, Traditional Chinese name, area, state/province, latitude, longitude].
// Park names reflect 64 U.S., 48 Canadian (including reserves), and 35 Japanese national parks (November 2026).
window.TravelAtlasPlaces = { cities: travelCities, us: [["acad","Acadia","阿卡迪亞","east","ME",44.3099,-68.3045],["arch","Arches","拱門","mountain","UT",38.7225,-109.5864],["badl","Badlands","惡地","mountain","SD",43.6854,-102.4833],["bibe","Big Bend","大彎曲","mountain","TX",29.2974,-103.2294],["bisc","Biscayne","比斯坎","east","FL",25.4905,-80.2102],["blca","Black Canyon of the Gunnison","甘尼森黑峽谷","mountain","CO",38.578,-107.7244],["brca","Bryce Canyon","布萊斯峽谷","mountain","UT",37.5839,-112.1827],["cany","Canyonlands","峽谷地","mountain","UT",38.2451,-109.8801],["care","Capitol Reef","圓頂礁","mountain","UT",38.1773,-111.1764],["cave","Carlsbad Caverns","卡爾斯巴德洞穴","mountain","NM",32.1409,-104.553],["chis","Channel Islands","海峽群島","west","CA",33.9866,-119.9112],["chir","Chiricahua","奇里卡瓦","mountain","AZ",32.012,-109.342],["cong","Congaree","康加里","east","SC",33.7919,-80.7487],["crla","Crater Lake","火山口湖","west","OR",42.9411,-122.1328],["cuva","Cuyahoga Valley","凱霍加谷","midwest","OH",41.2591,-81.571],["deva","Death Valley","死亡谷","west","CA",36.4782,-117.1298],["dena","Denali","迪納利","alaska","AK",63.3411,-150.7342],["drto","Dry Tortugas","海龜島","east","FL",24.6488,-82.8718],["ever","Everglades","大沼澤地","east","FL",25.3751,-80.8815],["gaar","Gates of the Arctic","北極之門","alaska","AK",67.7968,-153.3098],["jeff","Gateway Arch","大拱門","midwest","MO",38.6233,-90.1804],["glac","Glacier","冰河","mountain","MT",48.6833,-113.8003],["glba","Glacier Bay","冰川灣","alaska","AK",58.7914,-136.8108],["grca","Grand Canyon","大峽谷","mountain","AZ",36.1722,-112.6843],["grte","Grand Teton","大提頓","mountain","WY",43.8182,-110.7055],["grba","Great Basin","大盆地","mountain","NV",38.9461,-114.258],["grsa","Great Sand Dunes","大沙丘","mountain","CO",37.7766,-105.6289],["grsm","Great Smoky Mountains","大煙山","east","NC · TN",35.6006,-83.5085],["gumo","Guadalupe Mountains","瓜達盧佩山","mountain","TX",31.923,-104.8855],["hale","Haleakalā","哈萊阿卡拉","hawaii","HI",20.7069,-156.1592],["havo","Hawaiʻi Volcanoes","夏威夷火山","hawaii","HI",19.3345,-155.4699],["hosp","Hot Springs","溫泉","east","AR",34.5241,-93.0634],["indu","Indiana Dunes","印第安納沙丘","midwest","IN",41.6372,-87.0971],["isro","Isle Royale","羅亞爾島","midwest","MI",48.011,-88.8284],["jotr","Joshua Tree","約書亞樹","west","CA",33.915,-115.8424],["katm","Katmai","卡特邁","alaska","AK",58.5624,-154.9787],["kefj","Kenai Fjords","基奈峽灣","alaska","AK",59.8162,-150.1081],["kica","Kings Canyon","國王峽谷","west","CA",36.8917,-118.5981],["kova","Kobuk Valley","科伯克谷","alaska","AK",67.3534,-159.1989],["lacl","Lake Clark","克拉克湖","alaska","AK",60.5471,-153.2487],["lavo","Lassen Volcanic","拉森火山","west","CA",40.4935,-121.4076],["maca","Mammoth Cave","猛獁洞","east","KY",37.1976,-86.1309],["meve","Mesa Verde","梅薩維德","mountain","CO",37.2391,-108.4624],["mora","Mount Rainier","雷尼爾山","west","WA",46.8609,-121.7056],["npsa","National Park of American Samoa","美屬薩摩亞","territories","AS",-14.2446,-169.9076],["neri","New River Gorge","新河峽谷","east","WV",38.068,-81.084],["noca","North Cascades","北瀑布","west","WA",48.7111,-121.2054],["olym","Olympic","奧林匹克","west","WA",47.8032,-123.6661],["pefo","Petrified Forest","石化林","mountain","AZ",34.9837,-109.7878],["pinn","Pinnacles","尖峰","west","CA",36.4904,-121.1812],["redw","Redwood","紅木","west","CA",41.3713,-124.0317],["romo","Rocky Mountain","洛磯山","mountain","CO",40.3555,-105.6973],["sagu","Saguaro","巨柱仙人掌","mountain","AZ",32.209,-110.7574],["sequ","Sequoia","紅杉","west","CA",36.5077,-118.5752],["shen","Shenandoah","仙納度","east","VA",38.4918,-78.4691],["thro","Theodore Roosevelt","羅斯福","mountain","ND",47.1757,-103.43],["viis","Virgin Islands","維京群島","territories","VI",18.3427,-64.7439],["voya","Voyageurs","航海者","midwest","MN",48.4836,-92.8381],["whsa","White Sands","白沙","mountain","NM",32.779,-106.171],["wica","Wind Cave","風洞","mountain","SD",43.5801,-103.4395],["wrst","Wrangell–St. Elias","蘭格爾－聖伊萊亞斯","alaska","AK",61.07,-142.4342],["yell","Yellowstone","黃石","mountain","WY · MT · ID",44.5965,-110.5472],["yose","Yosemite","優勝美地","west","CA",37.8483,-119.5572],["zion","Zion","錫安","mountain","UT",37.2982,-113.0265]], ca: [["akamiuapishkukakkasuakmealy-mountains","Akami–Uapishku–KakKasuak–Mealy Mountains","米利山脈","atlantic","NL",53.5724,-58.3439],["aulavik","Aulavik","奧拉維克","north","NT",73.7529,-119.5948],["auyuittuq","Auyuittuq","奧尤特克","north","NU",67.3674,-66.0109],["banff","Banff","班夫","rockies","AB",51.5431,-116.1237],["bruce-peninsula","Bruce Peninsula","布魯斯半島","central","ON",45.1934,-81.4918],["cape-breton-highlands","Cape Breton Highlands","布雷頓角高地","atlantic","NS",46.7323,-60.6411],["elk-island","Elk Island","麋鹿島","rockies","AB",53.6077,-112.8619],["forillon","Forillon","福里隆","central","QC",48.7908,-64.2061],["fundy","Fundy","芬迪","atlantic","NB",45.6192,-65.0353],["georgian-bay-islands","Georgian Bay Islands","喬治亞灣群島","central","ON",44.8803,-79.8706],["glacier","Glacier","冰川","pacific","BC",51.2686,-117.5243],["grasslands","Grasslands","草原","rockies","SK",49.1027,-107.172],["gros-morne","Gros Morne","格羅莫訥","atlantic","NL",49.6309,-57.7361],["gulf-islands","Gulf Islands","海灣群島","pacific","BC",48.6884,-123.3519],["gwaii-haanas","Gwaii Haanas","瓜伊哈納斯","pacific","BC",52.4307,-131.4768],["ivvavik","Ivvavik","伊瓦維克","north","YT",69.1058,-139.849],["jasper","Jasper","賈斯珀","rockies","AB",52.8515,-117.9842],["kejimkujik","Kejimkujik","凱吉姆庫吉克","atlantic","NS",43.8569,-64.8299],["kluane","Kluane","克魯瓦尼","north","YT",60.6314,-139.2023],["kootenay","Kootenay","庫特尼","pacific","BC",50.962,-116.0414],["kouchibouguac","Kouchibouguac","庫奇布瓜克","atlantic","NB",46.8298,-64.9507],["la-mauricie","La Mauricie","莫里西","central","QC",46.7877,-72.9659],["mingan-archipelago","Mingan Archipelago","明根群島","central","QC",50.2237,-63.5481],["mount-revelstoke","Mount Revelstoke","雷夫爾斯托克山","pacific","BC",51.0934,-118.0448],["nahanni","Nahanni","納漢尼","north","NT",61.6102,-125.9039],["naatsihchoh","Náátsʼįhchʼoh","納茨希喬","north","NT",62.6718,-128.5458],["pacific-rim","Pacific Rim","太平洋沿岸","pacific","BC",48.8735,-125.3171],["pituamkek","Pituamkek","皮圖阿姆凱克","atlantic","PE",46.66,-63.88],["point-pelee","Point Pelee","佩利角","central","ON",41.9627,-82.5186],["prince-albert","Prince Albert","阿爾伯特王子","rockies","SK",53.9635,-106.3699],["prince-edward-island","Prince Edward Island","愛德華王子島","atlantic","PE",46.4472,-63.0762],["pukaskwa","Pukaskwa","普卡斯夸","central","ON",48.2894,-85.9041],["qausuittuq","Qausuittuq","考蘇伊圖克","north","NU",76.1412,-100.9322],["quttinirpaaq","Quttinirpaaq","庫蒂尼爾帕克","north","NU",82.1323,-71.6482],["riding-mountain","Riding Mountain","騎山","rockies","MB",50.8286,-100.201],["sable-island","Sable Island","塞布爾島","atlantic","NS",43.9458,-59.901],["sirmilik","Sirmilik","錫米利克","north","NU",73.0757,-79.8281],["terra-nova","Terra Nova","新大陸","atlantic","NL",48.5256,-53.9638],["thaidene-nene","Thaidene Nëné","泰德內內","north","NT",62.7,-108.2],["thousand-islands","Thousand Islands","千島","central","ON",44.3759,-76.0158],["torngat-mountains","Torngat Mountains","托恩加特山","atlantic","NL",59.2296,-63.9985],["tuktut-nogait","Tuktut Nogait","圖克圖特諾蓋特","north","NT",68.7498,-121.8127],["ukkusiksalik","Ukkusiksalik","烏庫西克薩利克","north","NU",65.841,-89.7334],["vuntut","Vuntut","文圖特","north","YT",68.3901,-139.8649],["wapusk","Wapusk","瓦普斯克","rockies","MB",57.798,-93.2317],["waterton-lakes","Waterton Lakes","沃特頓湖","rockies","AB",49.0813,-113.9332],["wood-buffalo","Wood Buffalo","伍德布法羅","north","AB · NT",60.2681,-114.1582],["yoho","Yoho","幽鶴","pacific","BC",51.384,-116.5264]], jp: [["rishiri","Rishiri-Rebun-Sarobetsu","利尻禮文佐呂別","hokkaido","北海道",45.1938,141.346],["shiretoko","Shiretoko","知床","hokkaido","北海道",44.1771,145.1914],["akan","Akan-Mashu","阿寒摩周","hokkaido","北海道",43.5389,144.2911],["kushiro","Kushiro Shitsugen","釧路濕原","hokkaido","北海道",43.1359,144.4562],["taisetsu","Daisetsuzan","大雪山","hokkaido","北海道",43.5118,142.9371],["hidaka","Hidaka Mountains–Erimo–Tokachi","日高山脈襟裳十勝","hokkaido","北海道",42.45,143.25],["shikotsu","Shikotsu-Toya","支笏洞爺","hokkaido","北海道",42.7434,141.0942],["towada","Towada-Hachimantai","十和田八幡平","tohoku","青森・秋田・岩手",40.2174,140.863],["sanriku","Sanriku Fukko","三陸復興","tohoku","青森・岩手・宮城",39.6644,141.7887],["bandai","Bandai-Asahi","磐梯朝日","tohoku","山形・福島・新潟",38.0614,139.9336],["nikko","Nikko","日光","kanto","栃木・群馬・福島",36.9317,139.6899],["oze","Oze","尾瀨","kanto","群馬・福島・新潟・栃木",36.967,139.3289],["joshinetsu","Joshinetsu Kogen","上信越高原","kanto","群馬・長野・新潟",36.6615,138.4706],["myoko","Myoko-Togakushi Renzan","妙高戶隱連山","kanto","新潟・長野",36.75,138.07],["chichibu","Chichibu-Tama-Kai","秩父多摩甲斐","kanto","東京・埼玉・山梨・長野",35.864,138.8624],["ogasawara","Ogasawara","小笠原","islands","東京都・小笠原",26.3355,141.5761],["fuji","Fuji-Hakone-Izu","富士箱根伊豆","kanto","東京・神奈川・靜岡・山梨",34.3043,139.1991],["chubu","Chubu Sangaku","中部山岳","chubu","富山・長野・岐阜・新潟",36.4805,137.6418],["hakusan","Hakusan","白山","chubu","石川・福井・岐阜・富山",36.1831,136.7041],["minamialps","Minami Alps","南阿爾卑斯","chubu","長野・山梨・靜岡",35.5675,138.2106],["ise","Ise-Shima","伊勢志摩","west","三重",34.3852,136.7175],["yoshino","Yoshino-Kumano","吉野熊野","west","奈良・三重・和歌山",33.9056,136.0106],["sanin","Sanin Kaigan","山陰海岸","west","京都・兵庫・鳥取",35.6364,134.5935],["setonaikai","Setonaikai","瀨戶內海","west","本州・四國・九州沿岸",34.0279,133.1392],["daisen","Daisen-Oki","大山隱岐","west","鳥取・島根・岡山",35.7297,133.2655],["ashizuri","Ashizuri-Uwakai","足摺宇和海","west","高知・愛媛",33.0166,132.6425],["saikai","Saikai","西海","kyushu","長崎",33.015,129.1713],["unzen","Unzen-Amakusa","雲仙天草","kyushu","長崎・熊本・鹿兒島",32.482,130.2045],["aso","Aso-Kuju","阿蘇九重","kyushu","熊本・大分",33.0474,131.1953],["kirishima","Kirishima-Kinkowan","霧島錦江灣","kyushu","宮崎・鹿兒島",31.4896,130.7431],["yakushima","Yakushima","屋久島","islands","鹿兒島・屋久島",30.3608,130.4066],["amami","Amami Gunto","奄美群島","islands","鹿兒島・奄美",28.36,129.49],["yambaru","Yambaru","山原","islands","沖繩・沖繩本島北部",26.75,128.22],["kerama","Kerama Shoto","慶良間諸島","islands","沖繩・慶良間",26.2018,127.4062],["iriomote","Iriomote-Ishigaki","西表石垣","islands","沖繩・八重山",24.3289,123.953]] };
