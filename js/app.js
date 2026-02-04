// 全局变量
let map;
let cities = [];
let cityMarkers = {};
let currentCityIndex = -1;
let currentQuestionCity = null;
let score = 0;
let totalQuestions = 0;
let questionAnswered = false;
let wrongAttempts = 0;
const maxWrongAttempts = 3;
let historyCities = []; // 记录最近30条历史
const maxHistorySize = 30;
let lastQuestionCenter = null; // 记录上一题的中心点
let countryBoundaryLayer = null; // 当前显示的国家边界图层
let allCountriesLayer = null; // 所有国家边界图层
let cityLabelsLayer = null; // 城市名称标签图层
let cheatMode = false; // 作弊模式开关
let showAllCountries = true; // 是否显示所有国家边界
let currentPopup = null; // 当前打开的popup对象
let hardMode = false; // 困难模式开关
let filterType = 'continent'; // 当前筛选类型：continent 或 subregion
let selectedFilters = new Set(); // 当前选中的筛选项

// 初始化地图
function initMap() {
    map = L.map('map', {
        zoomControl: false  // 禁用默认的zoom控件
    }).setView([20, 0], 2);

    // 监听popup打开事件，确保只有一个popup被打开
    map.on('popupopen', function(e) {
        // 如果打开的popup不是我们当前管理的popup，关闭它
        if (currentPopup && e.popup !== currentPopup) {
            map.removeLayer(e.popup);
        }
    });

    // 定义底图
    var CartoDB_VoyagerNoLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });

    var Esri_OceanBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
        maxZoom: 13
    });

    // 添加默认底图
    Esri_OceanBasemap.addTo(map);

    // 添加底图切换控件
    var baseMaps = {
        "CartoDB Voyager": CartoDB_VoyagerNoLabels,
        "Ocean Base": Esri_OceanBasemap
    };

    const layersControl = L.control.layers(baseMaps).addTo(map);

    // 创建国家边界Radio Group
    const countryBoundaryGroup = L.DomUtil.create('div', 'custom-radio-group');
    const countryTitle = L.DomUtil.create('div', 'custom-radio-title');
    countryTitle.textContent = 'Country Boundary';
    countryBoundaryGroup.appendChild(countryTitle);

    // 从localStorage读取状态
    const savedShowAllCountries = localStorage.getItem('showAllCountries');
    showAllCountries = savedShowAllCountries === 'true';

    // 创建两个选项：No Boundary 和 With Boundary
    const noBoundaryOption = L.DomUtil.create('div', 'custom-radio-option');
    if (!showAllCountries) noBoundaryOption.classList.add('active');
    noBoundaryOption.innerHTML = `<input type="radio" name="boundary" ${!showAllCountries ? 'checked' : ''}><span style="margin-left: 5px;font-size:1.08333em;">No Boundary</span>`;

    const withBoundaryOption = L.DomUtil.create('div', 'custom-radio-option');
    if (showAllCountries) withBoundaryOption.classList.add('active');
    withBoundaryOption.innerHTML = `<input type="radio" name="boundary" ${showAllCountries ? 'checked' : ''}><span style="margin-left: 5px;font-size:1.08333em;">With Boundary</span>`;

    // 点击选项切换国家边界显示
    noBoundaryOption.onclick = function() {
        showAllCountries = false;
        localStorage.setItem('showAllCountries', 'false');
        noBoundaryOption.classList.add('active');
        withBoundaryOption.classList.remove('active');
        noBoundaryOption.querySelector('input').checked = true;
        withBoundaryOption.querySelector('input').checked = false;

        if (allCountriesLayer) {
            map.removeLayer(allCountriesLayer);
        }
    };

    withBoundaryOption.onclick = function() {
        showAllCountries = true;
        localStorage.setItem('showAllCountries', 'true');
        withBoundaryOption.classList.add('active');
        noBoundaryOption.classList.remove('active');
        withBoundaryOption.querySelector('input').checked = true;
        noBoundaryOption.querySelector('input').checked = false;

        if (allCountriesLayer) {
            allCountriesLayer.addTo(map);
        }
    };

    countryBoundaryGroup.appendChild(noBoundaryOption);
    countryBoundaryGroup.appendChild(withBoundaryOption);

    // 创建Hard Mode Radio Group
    const hardModeGroup = L.DomUtil.create('div', 'custom-radio-group');
    const hardModeTitle = L.DomUtil.create('div', 'custom-radio-title');
    hardModeTitle.textContent = 'Difficulty';
    hardModeGroup.appendChild(hardModeTitle);

    // 从localStorage读取状态
    const savedHardMode = localStorage.getItem('hardMode');
    hardMode = savedHardMode === 'true';

    // 创建两个选项：Easy Mode 和 Hard Mode
    const easyModeOption = L.DomUtil.create('div', 'custom-radio-option');
    if (!hardMode) easyModeOption.classList.add('active');
    easyModeOption.innerHTML = `<input type="radio" name="difficulty" ${!hardMode ? 'checked' : ''}><span style="margin-left: 5px;font-size:1.08333em;">Easy Mode</span>`;

    const hardModeOption = L.DomUtil.create('div', 'custom-radio-option');
    if (hardMode) hardModeOption.classList.add('active');
    hardModeOption.innerHTML = `<input type="radio" name="difficulty" ${hardMode ? 'checked' : ''}><span style="margin-left: 5px;font-size:1.08333em;">Hard Mode</span>`;

    // 点击选项切换Hard Mode
    easyModeOption.onclick = function() {
        hardMode = false;
        localStorage.setItem('hardMode', 'false');
        easyModeOption.classList.add('active');
        hardModeOption.classList.remove('active');
        easyModeOption.querySelector('input').checked = true;
        hardModeOption.querySelector('input').checked = false;

        // 如果在游戏中切换，更新当前题目的错误次数显示
        if (currentCityIndex >= 0 && !questionAnswered) {
            const targetCity = cities[currentCityIndex];
            document.getElementById('current-question').innerHTML =
                `请找出: ${targetCity.country} ${targetCity.city}`;
        }
    };

    hardModeOption.onclick = function() {
        hardMode = true;
        localStorage.setItem('hardMode', 'true');
        hardModeOption.classList.add('active');
        easyModeOption.classList.remove('active');
        hardModeOption.querySelector('input').checked = true;
        easyModeOption.querySelector('input').checked = false;

        // 如果在游戏中切换，更新当前题目的错误次数显示
        if (currentCityIndex >= 0 && !questionAnswered) {
            const targetCity = cities[currentCityIndex];
            document.getElementById('current-question').innerHTML =
                `请找出: ${targetCity.country} ${targetCity.city}`;
        }
    };

    hardModeGroup.appendChild(easyModeOption);
    hardModeGroup.appendChild(hardModeOption);

    // 将Radio Groups添加到layers控件中
    L.DomEvent.disableClickPropagation(countryBoundaryGroup);
    L.DomEvent.disableClickPropagation(hardModeGroup);

    const layersControlDiv = layersControl.getContainer();
    if (layersControlDiv) {
        const sections = layersControlDiv.getElementsByClassName('leaflet-control-layers-list');
        if (sections.length > 0) {
            const separator = L.DomUtil.create('div', 'leaflet-control-layers-separator');
            sections[0].appendChild(separator);
            sections[0].appendChild(countryBoundaryGroup);
            sections[0].appendChild(hardModeGroup);
        }
    }

    // 加载所有国家边界（根据localStorage状态决定是否显示）
    loadAllCountries();

    // 加载城市数据（数据加载完成后初始化筛选控件）
    loadCities();
}

// 加载所有国家边界
function loadAllCountries() {
    if (typeof countryBoundary !== 'undefined' && countryBoundary) {
        allCountriesLayer = L.geoJSON(countryBoundary, {
            style: {
                color: '#000000',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0
            }
        });

        // 根据localStorage状态决定是否显示
        if (showAllCountries) {
            allCountriesLayer.addTo(map);
        }
    }
}

// 加载城市数据
function loadCities() {
    fetch('data/cities.json')
        .then(response => response.json())
        .then(data => {
            cities = data;
            addCityMarkers();
            showCityMarkers();
            // 初始化筛选控件（需要在数据加载后调用）
            initFilterControl();
            // 应用初始筛选（无筛选，显示全部）
            applyFilter();
            startNewQuestion();
        })
        .catch(error => {
            console.error('加载城市数据失败:', error);
            document.getElementById('current-question').textContent = '加载城市数据失败';
        });
}

// 添加所有城市标记
function addCityMarkers() {
    cities.forEach((city, index) => {
        const icon = L.divIcon({
            className: 'city-marker',
            iconSize: [15, 15],
            iconAnchor: [10, 10]
        });

        const marker = L.marker([city.lat, city.lon], {icon: icon})
            .on('click', function () {
                handleCityClick(index);
            });

        // 添加popup（禁用自动移动镜头，只在需要时通过我们的openPopup函数显示）
        marker.bindPopup(generatePopupContent(city), {
            maxWidth: 350,
            autoPan: false  // 禁用自动移动镜头
        });

        cityMarkers[index] = marker;
    });
}

// 显示所有城市标记
function showCityMarkers() {
    cities.forEach((city, index) => {
        if (!cityMarkers[index]) return;
        
        // 根据筛选条件决定是否显示
        const value = filterType === 'continent' ? city.continent : city.subregion;
        const shouldShow = selectedFilters.size === 0 || (value && selectedFilters.has(value));
        
        if (shouldShow && !map.hasLayer(cityMarkers[index])) {
            cityMarkers[index].addTo(map);
        }
    });
}

// 安全关闭popup
function closeCurrentPopup() {
    // 关闭通过 openPopup() 打开的独立popup
    if (currentPopup) {
        try {
            map.removeLayer(currentPopup);
        } catch(e) {
            // 忽略删除错误
        }
        currentPopup = null;
    }
    // 关闭所有marker绑定的popup
    map.eachLayer(function (layer) {
        if (layer instanceof L.Popup) {
            map.removeLayer(layer);
        }
    });
}

// 安全打开popup
function openPopup(popup) {
    closeCurrentPopup();
    currentPopup = popup;
    map.addLayer(popup);

    // 设置更高的z-index确保popup在最上层
    // 使用setTimeout确保popup已经渲染到DOM中
    setTimeout(function() {
        if (popup._container) {
            popup._container.style.zIndex = '9999';
        }
    }, 10);
}

// 生成popup内容
function generatePopupContent(city) {
    if (city.info) {
        // 将\n替换为<br>标签实现换行
        const formattedInfo = city.info.replace(/\n/g, '<br>');
        return `
            <div class="info-popup">
                <h3>${city.country} ${city.city}</h3>
                <p>${formattedInfo}</p>
            </div>
        `;
    } else {
        return `
            <div class="info-popup">
                <h3>${city.country} ${city.city}</h3>
                <p>位于${city.country}</p>
            </div>
        `;
    }
}

// 开始新问题
function startNewQuestion() {
    // 关闭所有打开的popup
    closeCurrentPopup();

    // 重置状态
    questionAnswered = false;
    wrongAttempts = 0;

    // 根据Hard Mode调整最大错误次数
    const currentMaxWrongAttempts = hardMode ? 1 : maxWrongAttempts;

    // 清除上一题的国家边界
    if (countryBoundaryLayer) {
        map.removeLayer(countryBoundaryLayer);
        countryBoundaryLayer = null;
    }

    // 先隐藏所有标记
    cities.forEach((city, index) => {
        if (cityMarkers[index] && map.hasLayer(cityMarkers[index])) {
            map.removeLayer(cityMarkers[index]);
        }
        // 重置标记样式
        const icon = L.divIcon({
            className: 'city-marker',
            iconSize: [15, 15],
            iconAnchor: [10, 10]
        });
        cityMarkers[index].setIcon(icon);
    });

    // 随机选择一个不在历史记录中的城市，且符合筛选条件
    let availableCities = cities.map((city, index) => index)
        .filter(index => {
            const city = cities[index];
            // 检查是否符合筛选条件
            const value = filterType === 'continent' ? city.continent : city.subregion;
            const matchFilter = selectedFilters.size === 0 || (value && selectedFilters.has(value));
            // 检查是否在历史记录中
            const notInHistory = !historyCities.includes(index);
            return matchFilter && notInHistory;
        });

    // 如果可用城市少于总城市的30%，清空历史记录
    if (availableCities.length < cities.length * 0.3) {
        historyCities = [];
        // 清空历史记录后重新生成可用城市列表，保持筛选条件
        availableCities = cities.map((city, index) => index)
            .filter(index => {
                const city = cities[index];
                // 检查是否符合筛选条件
                const value = filterType === 'continent' ? city.continent : city.subregion;
                const matchFilter = selectedFilters.size === 0 || (value && selectedFilters.has(value));
                return matchFilter;
            });
    }

    const randomIndex = Math.floor(Math.random() * availableCities.length);
    currentCityIndex = availableCities[randomIndex];
    currentQuestionCity = cities[currentCityIndex];

    // 显示问题
    document.getElementById('current-question').textContent =
        `请找出: ${currentQuestionCity.country} ${currentQuestionCity.city}`;

    // 将地图视图移动到该城市附近（但不显示标记）
    const targetCity = cities[currentCityIndex];
    // 获取当前zoom level，不改变zoom
    const currentZoom = map.getZoom();
    // 添加随机偏移量，防止直接猜到
    const randomOffset = 5 + Math.random() * 5; // 5-10度的随机偏移
    const randomAngle = Math.random() * Math.PI * 2; // 随机角度
    const offsetLat = Math.sin(randomAngle) * randomOffset;
    const offsetLon = Math.cos(randomAngle) * randomOffset;
    const newCenter = [targetCity.lat + offsetLat,targetCity.lon + offsetLon];

    // 距离检测函数：计算两点之间的球面距离（单位：公里）
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // 地球半径，单位公里
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 检查是否需要飞到新位置
    let shouldFlyTo = true;
    if (lastQuestionCenter) {
        const distance = calculateDistance(
            lastQuestionCenter[0], lastQuestionCenter[1],
            newCenter[0], newCenter[1]
        );
        if (distance <= 2000) {
            shouldFlyTo = false;
        }
    }

    // Hard mode下不自动飞到目标区域
    if (hardMode) {
        shouldFlyTo = false;
    }

    if (shouldFlyTo) {
        map.flyTo(newCenter, currentZoom, {
            duration: 0.5
        });
        lastQuestionCenter = newCenter;
    } else {
        // 不需要飞的时候，直接显示标记
        showCityMarkers();
    }

    // 如果需要飞，在flyto动画结束后显示标记
    if (shouldFlyTo) {
        map.once('moveend', function () {
            showCityMarkers();
        });
    }
}

// 处理城市点击
function handleCityClick(index) {
    const clickedCity = cities[index];
    const targetCity = cities[currentCityIndex];

    // 如果问题已回答,点击任何标记都只显示popup
    if (questionAnswered) {
        // 确保marker在地图上
        if (!map.hasLayer(cityMarkers[index])) {
            cityMarkers[index].addTo(map);
        }

        // 答案揭晓阶段,点击任意点时移动镜头
        const popupContent = generatePopupContent(clickedCity);

        // 关闭之前可能打开的任何popup（包括marker绑定的popup）
        closeCurrentPopup();

        const popup = L.popup({
            maxWidth: 350,
            autoPan: true,  // 移动镜头
            closeButton: true,
            closeOnClick: true
        }).setLatLng([clickedCity.lat, clickedCity.lon]).setContent(popupContent);

        openPopup(popup);  // 使用安全打开方法
        return;
    }

    if (index === currentCityIndex) {
        // 答对了
        questionAnswered = true;
        totalQuestions++;
        score++;
        document.getElementById('score').textContent = score;
        document.getElementById('total').textContent = totalQuestions;

        // 记录到历史
        historyCities.push(currentCityIndex);
        if (historyCities.length > maxHistorySize) {
            historyCities.shift();
        }

        // 更新标记样式为正确
        const marker = cityMarkers[index];
        const correctIcon = L.divIcon({
            className: 'city-marker correct-marker',
            iconSize: [15, 15],
            iconAnchor: [12.5, 12.5]
        });
        marker.setIcon(correctIcon);

        // 显示成功消息
        document.getElementById('current-question').innerHTML =
            `Correct！${targetCity.country} ${targetCity.city} 位置正确`;

        // 显示国家边界
        showCountryBoundary(targetCity.country);

        // 使用独立popup显示（移动镜头）
        const popupContent = generatePopupContent(targetCity);

        const popup = L.popup({
            maxWidth: 350,
            autoPan: true,  // 答对时移动镜头
            closeButton: true,
            closeOnClick: true
        }).setLatLng([targetCity.lat, targetCity.lon]).setContent(popupContent);

        openPopup(popup);  // 使用安全打开方法

    } else {
        // 答错了
        wrongAttempts++;
        const currentMaxWrongAttempts = hardMode ? 2 : maxWrongAttempts;
        const remainingAttempts = currentMaxWrongAttempts - wrongAttempts;

        // 关闭之前可能打开的popup
        closeCurrentPopup();

        // 更新错误标记样式
        const marker = cityMarkers[index];
        const wrongIcon = L.divIcon({
            className: 'city-marker wrong-marker',
            iconSize: [15, 15],
            iconAnchor: [12.5, 12.5]
        });
        marker.setIcon(wrongIcon);

        // 显示错误提示
        if (remainingAttempts > 0) {
            document.getElementById('current-question').innerHTML =
                `Wrong! 你点击的是${clickedCity.city}，要找的是${targetCity.country}的${targetCity.city}。还有 ${remainingAttempts} 次机会`;
        } else {
            // 最后一次答错，显示正确答案
            questionAnswered = true;
            totalQuestions++;
            document.getElementById('total').textContent = totalQuestions;

            // 记录到历史
            historyCities.push(currentCityIndex);
            if (historyCities.length > maxHistorySize) {
                historyCities.shift();
            }

            // 显示正确答案的标记
            const correctIcon = L.divIcon({
                className: 'city-marker correct-marker',
                iconSize: [15, 15],
                iconAnchor: [12.5, 12.5]
            });
            const correctMarkerObj = cityMarkers[currentCityIndex];
            correctMarkerObj.setIcon(correctIcon);

            document.getElementById('current-question').innerHTML =
                `Wrong! 你点击的是${clickedCity.city}，正确答案是${targetCity.city}`;

            // 使用独立popup显示正确答案
            const popupContent = generatePopupContent(targetCity);

            const popup = L.popup({
                maxWidth: 350,
                autoPan: true,  // 移动镜头
                closeButton: true,
                closeOnClick: true
            }).setLatLng([targetCity.lat, targetCity.lon]).setContent(popupContent);

            openPopup(popup);  // 使用安全打开方法

            // 显示国家边界
            showCountryBoundary(targetCity.country);
        }
    }
}

// 显示答案
function showAnswer() {
    if (!questionAnswered && currentCityIndex >= 0) {
        questionAnswered = true;
        totalQuestions++;
        document.getElementById('total').textContent = totalQuestions;

        // 记录到历史
        historyCities.push(currentCityIndex);
        if (historyCities.length > maxHistorySize) {
            historyCities.shift();
        }

        const targetCity = cities[currentCityIndex];

        // 显示正确答案
        const correctIcon = L.divIcon({
            className: 'city-marker correct-marker',
            iconSize: [15, 15],
            iconAnchor: [12.5, 12.5]
        });
        const correctMarkerObj = cityMarkers[currentCityIndex];
        correctMarkerObj.setIcon(correctIcon);

        document.getElementById('current-question').innerHTML =
            `正确答案是${targetCity.city} (${targetCity.country})`;

        // 使用独立popup显示
        const popupContent = generatePopupContent(targetCity);

        const popup = L.popup({
            maxWidth: 350,
            autoPan: true,  // 移动镜头
            closeButton: true,
            closeOnClick: true
        }).setLatLng([targetCity.lat, targetCity.lon]).setContent(popupContent);

        openPopup(popup);  // 使用安全打开方法

        // 显示国家边界
        showCountryBoundary(targetCity.country);
    }
}

// 显示国家边界
function showCountryBoundary(countryName) {
    // 清除之前的国家边界高亮
    if (countryBoundaryLayer) {
        map.removeLayer(countryBoundaryLayer);
    }

    // 尝试从countryBoundary中找到匹配的国家
    if (typeof countryBoundary !== 'undefined' && countryBoundary) {
        const matchedFeature = countryBoundary.features.find(feature =>
            feature.properties && feature.properties.NAME_ZH === countryName
        );

        if (matchedFeature) {
            // 在所有国家边界之上显示高亮的国家
            countryBoundaryLayer = L.geoJSON(matchedFeature, {
                style: {
                    color: '#4a5568',
                    weight: 3,
                    fillColor: '#4a5568',
                    fillOpacity: 0.3
                }
            }).addTo(map);
        }
    }
}

// 下一题
function nextQuestion() {
    startNewQuestion();
}

// 切换作弊模式
function toggleCheatMode() {
    cheatMode = !cheatMode;
    const toggleBtn = document.getElementById('cheat-toggle');

    if (cheatMode) {
        toggleBtn.classList.add('active');
        showCityLabels();
    } else {
        toggleBtn.textContent = 'Cheat Mode';
        toggleBtn.classList.remove('active');
        hideCityLabels();
    }
}

// 显示城市名称标签
function showCityLabels() {
    if (cityLabelsLayer) {
        map.removeLayer(cityLabelsLayer);
    }

    const markers = cities.map(city => {
        const icon = L.divIcon({
            className: 'city-label',
            html: city.city,
            iconSize: null,
            iconAnchor: [0, 0]
        });
        return L.marker([city.lat, city.lon], { icon: icon, interactive: false });
    });

    cityLabelsLayer = L.layerGroup(markers).addTo(map);
}

// 隐藏城市名称标签
function hideCityLabels() {
    if (cityLabelsLayer) {
        map.removeLayer(cityLabelsLayer);
        cityLabelsLayer = null;
    }
}

// 获取所有唯一的大洲和子区域
function getUniqueRegions() {
    const continents = new Set();
    const subregions = new Set();

    cities.forEach(city => {
        if (city.continent) continents.add(city.continent);
        if (city.subregion) subregions.add(city.subregion);
    });

    // 子区域自定义排序顺序
    const subregionOrder = [
        '东亚',
        '东南亚',
        '南亚',
        '西伯利亚',
        '中亚',
        '西亚',
        '巴尔干',
        '东欧',
        '西欧',
        '北欧',
        '南欧',
        '大洋洲',
        '北非',
        '东非',
        '西非',
        '南部非洲',
        '北美',
        '拉丁美洲'
    ];

    // 排序函数
    const sortSubregions = (a, b) => {
        const indexA = subregionOrder.indexOf(a);
        const indexB = subregionOrder.indexOf(b);

        // 如果两个都在自定义顺序中，按自定义顺序排序
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        // 如果只有a在自定义顺序中，a排在前面
        if (indexA !== -1) {
            return -1;
        }
        // 如果只有b在自定义顺序中，b排在前面
        if (indexB !== -1) {
            return 1;
        }
        // 都不在自定义顺序中，按拼音排序
        return a.localeCompare(b, 'zh-CN');
    };

    return {
        continents: Array.from(continents).sort(),
        subregions: Array.from(subregions).sort(sortSubregions)
    };
}

// 生成筛选选项
function renderFilterOptions() {
    const filterContent = document.getElementById('filter-options');
    const regions = getUniqueRegions();
    const options = filterType === 'continent' ? regions.continents : regions.subregions;
    
    // 统计每个选项的城市数量
    const counts = {};
    cities.forEach(city => {
        const value = filterType === 'continent' ? city.continent : city.subregion;
        if (value) {
            counts[value] = (counts[value] || 0) + 1;
        }
    });
    
    filterContent.innerHTML = options.map(option => {
        const count = counts[option] || 0;
        const isSelected = selectedFilters.has(option);
        return `
            <div class="filter-option ${isSelected ? 'selected' : ''}" data-value="${option}">
                <input type="checkbox" ${isSelected ? 'checked' : ''}>
                <span>${option}</span>
                <span class="filter-count">${count}</span>
            </div>
        `;
    }).join('');
    
    // 绑定点击事件
    filterContent.querySelectorAll('.filter-option').forEach(option => {
        option.addEventListener('click', function(e) {
            // 阻止复选框的默认行为
            e.preventDefault();
            
            const value = this.dataset.value;
            const checkbox = this.querySelector('input[type="checkbox"]');
            
            if (selectedFilters.has(value)) {
                selectedFilters.delete(value);
                checkbox.checked = false;
                this.classList.remove('selected');
            } else {
                selectedFilters.add(value);
                checkbox.checked = true;
                this.classList.add('selected');
            }
            
            applyFilter();
            startNewQuestion();
        });

        // 点击复选框也触发筛选
        option.querySelector('input[type="checkbox"]').addEventListener('click', function(e) {
            e.stopPropagation();
            const value = option.dataset.value;
            if (this.checked) {
                selectedFilters.add(value);
                option.classList.add('selected');
            } else {
                selectedFilters.delete(value);
                option.classList.remove('selected');
            }
            applyFilter();
            startNewQuestion();
        });
    });
}

// 应用筛选
function applyFilter() {
    cities.forEach((city, index) => {
        const marker = cityMarkers[index];
        if (!marker) return;
        
        const value = filterType === 'continent' ? city.continent : city.subregion;
        
        // 如果没有选中任何筛选，显示所有城市
        if (selectedFilters.size === 0) {
            marker.addTo(map);
            return;
        }
        
        // 如果城市匹配筛选条件，显示
        if (value && selectedFilters.has(value)) {
            marker.addTo(map);
        } else {
            map.removeLayer(marker);
        }
    });
    
    // 如果在城市名称标签模式下，也要更新标签
    if (cheatMode && cityLabelsLayer) {
        showCityLabels();
    }
}

// 切换筛选类型
function toggleFilterType(type) {
    filterType = type;
    selectedFilters.clear(); // 切换类型时清空选中状态
    renderFilterOptions();
    applyFilter();
}

// 切换筛选面板
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    panel.classList.toggle('show');
}

// 绑定筛选相关事件
function initFilterControl() {
    // 切换筛选类型标签
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            toggleFilterType(this.dataset.filter);
        });
    });
    
    // 切换筛选面板
    document.getElementById('filter-toggle').addEventListener('click', function(e) {
        e.stopPropagation();
        toggleFilterPanel();
    });
    
    // 点击页面其他地方关闭面板
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('filter-panel');
        const container = document.getElementById('filter-control-container');
        if (!panel.contains(e.target) && !container.contains(e.target)) {
            panel.classList.remove('show');
        }
    });
    
    // 初始渲染
    renderFilterOptions();
}

// 绑定按钮事件
document.getElementById('next-btn').addEventListener('click', nextQuestion);
document.getElementById('show-answer-btn').addEventListener('click', showAnswer);
document.getElementById('cheat-toggle').addEventListener('click', toggleCheatMode);
document.getElementById('help-button').addEventListener('click', showHelp);

// 显示帮助弹窗
function showHelp() {
    const modal = document.getElementById('help-modal');
    modal.classList.add('show');
}

// 关闭帮助弹窗
function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    modal.classList.remove('show');
}

// 点击弹窗外部关闭
document.getElementById('help-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeHelpModal();
    }
});

// 初始化
window.onload = initMap;
