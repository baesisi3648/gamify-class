(function () {
  "use strict";

  var loginScreen = document.getElementById("login-screen");
  var studentApp = document.getElementById("student-app");
  var teacherApp = document.getElementById("teacher-app");
  var toast = document.getElementById("toast");
  var toastTimer;
  var photos = [];
  var dexLimit = 3;
  var currentClass = "all";
  var currentFilter = "all";
  var kakaoMap;
  var kakaoMapLoading = false;
  var currentLocationMarker;
  var observationMarkers = [];
  var schoolPosition = { lat: 37.2947967, lng: 127.2404688 };
  var locationPickerMap;
  var locationPickerMarker;
  var pendingLocation;
  var selectedLocation;
  var pickerPreviousFocus;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  var candidateData = {
    plant: [
      { name: "서양민들레", scientific: "Taraxacum officinale", clue: "바깥쪽 총포 조각이 아래로 젖혀짐", confidence: "가능성 높음", icon: "✿" },
      { name: "민들레", scientific: "Taraxacum platycarpum", clue: "총포 조각이 곧게 붙고 꽃이 선명한 노란색", confidence: "비교 필요", icon: "✿" },
      { name: "씀바귀", scientific: "Ixeridium dentatum", clue: "줄기가 갈라지고 꽃잎 수가 비교적 적음", confidence: "가능성 낮음", icon: "♧" }
    ],
    insect: [
      { name: "배추흰나비", scientific: "Pieris rapae", clue: "흰 날개와 앞날개의 검은 점", confidence: "가능성 높음", icon: "◆" },
      { name: "대만흰나비", scientific: "Pieris canidia", clue: "날개 시맥을 따라 검은 무늬가 발달", confidence: "비교 필요", icon: "◇" },
      { name: "큰줄흰나비", scientific: "Pieris melete", clue: "날개 뒷면의 시맥 무늬가 뚜렷함", confidence: "가능성 낮음", icon: "◆" }
    ],
    bird: [
      { name: "직박구리", scientific: "Hypsipetes amaurotis", clue: "회갈색 몸과 뾰족한 머리깃", confidence: "가능성 높음", icon: "⌁" },
      { name: "참새", scientific: "Passer montanus", clue: "갈색 머리와 흰 뺨의 검은 점", confidence: "비교 필요", icon: "⌁" },
      { name: "찌르레기", scientific: "Spodiopsar cineraceus", clue: "회색 몸과 주황색 부리", confidence: "가능성 낮음", icon: "⌁" }
    ],
    animal: [
      { name: "청설모", scientific: "Sciurus vulgaris", clue: "붉은빛 털과 길고 풍성한 꼬리", confidence: "가능성 높음", icon: "♞" },
      { name: "다람쥐", scientific: "Eutamias sibiricus", clue: "등에 다섯 개의 검은 줄무늬", confidence: "비교 필요", icon: "♞" },
      { name: "족제비", scientific: "Mustela sibirica", clue: "길쭉한 몸과 짧은 다리", confidence: "가능성 낮음", icon: "♞" }
    ],
    water: [
      { name: "참개구리", scientific: "Pelophylax nigromaculatus", clue: "등의 검은 반점과 뚜렷한 등주름", confidence: "가능성 높음", icon: "●" },
      { name: "금개구리", scientific: "Pelophylax chosenicus", clue: "등 양쪽의 금색 융기선", confidence: "확인 필요", icon: "●" },
      { name: "청개구리", scientific: "Dryophytes japonicus", clue: "작은 몸과 발가락 끝 흡반", confidence: "가능성 낮음", icon: "●" }
    ],
    fungi: [
      { name: "구름버섯", scientific: "Trametes versicolor", clue: "부채꼴 갓에 여러 색의 둥근 무늬", confidence: "가능성 높음", icon: "♠" },
      { name: "치마버섯", scientific: "Schizophyllum commune", clue: "회백색 부채꼴 갓과 갈라진 주름", confidence: "비교 필요", icon: "♠" },
      { name: "말불버섯", scientific: "Lycoperdon perlatum", clue: "둥근 자실체 표면의 작은 돌기", confidence: "가능성 낮음", icon: "♠" }
    ],
    etc: [
      { name: "미확인 생물 A", scientific: "Taxon incertae sedis", clue: "사진과 관찰 특징을 추가로 비교하세요", confidence: "추가 조사", icon: "?" },
      { name: "미확인 생물 B", scientific: "Unidentified organism", clue: "다른 각도의 사진이 필요합니다", confidence: "추가 조사", icon: "?" },
      { name: "직접 동정하기", scientific: "Manual identification", clue: "도감이나 생물 데이터베이스에서 검색하세요", confidence: "학생 조사", icon: "⌕" }
    ]
  };

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }

  function showStudent(viewName) {
    loginScreen.hidden = true;
    teacherApp.hidden = true;
    studentApp.hidden = false;
    setView(viewName || "home");
    window.scrollTo(0, 0);
  }

  function showTeacher() {
    loginScreen.hidden = true;
    studentApp.hidden = true;
    teacherApp.hidden = false;
    buildClassOverview();
    window.scrollTo(0, 0);
  }

  function showLogin() {
    studentApp.hidden = true;
    teacherApp.hidden = true;
    loginScreen.hidden = false;
    window.scrollTo(0, 0);
  }

  function setView(name) {
    document.querySelectorAll(".app-view").forEach(function (view) {
      view.classList.toggle("active", view.id === "view-" + name);
    });
    document.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "map") window.setTimeout(ensureKakaoMap, 0);
  }

  document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    showStudent("home");
    showToast("3반 ECO QUEST에 입장했습니다.");
  });

  document.getElementById("demo-login").addEventListener("click", function () {
    document.getElementById("class-code").value = "ECO123";
    document.getElementById("student-number").value = "304";
    document.getElementById("student-pin").value = "1234";
    showStudent("home");
    showToast("샘플 학생 화면입니다. 데이터는 저장되지 않습니다.");
  });

  document.getElementById("teacher-preview").addEventListener("click", showTeacher);
  document.getElementById("profile-teacher-preview").addEventListener("click", showTeacher);
  document.getElementById("exit-teacher").addEventListener("click", function () { showStudent("home"); });
  document.getElementById("logout-button").addEventListener("click", showLogin);

  document.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view]");
    var goButton = event.target.closest("[data-go]");
    if (viewButton && !studentApp.hidden) setView(viewButton.dataset.view);
    if (goButton && !studentApp.hidden) setView(goButton.dataset.go);
  });

  /* Kakao map, tabs and filters */
  function showMapLoadError(message) {
    var loading = document.getElementById("map-loading");
    loading.classList.add("error");
    loading.innerHTML = '<span class="compass-icon">!</span><b>카카오맵을 불러오지 못했습니다</b><small>' + escapeHtml(message) + '<br>위의 “카카오맵에서 열기”로 학교 위치를 확인할 수 있습니다.</small>';
  }

  function renderSchoolInspector() {
    document.getElementById("map-inspector").innerHTML =
      '<div class="inspector-content">' +
        '<div class="place-visual"><span>⌂</span></div>' +
        '<span class="pixel-label">EXPEDITION BASE</span>' +
        '<h3>용인삼계고등학교</h3>' +
        '<p>생태 탐사의 기준 위치입니다. 학생 관찰이 등록되면 실제 발견 지점에 핀이 생성됩니다.</p>' +
        '<div class="species-list"><h4>학교 주소</h4><span>경기도 용인시 처인구 포곡읍 백옥대로1898번길 34-42</span></div>' +
      '</div>';
  }

  function ensureKakaoMap() {
    if (kakaoMap) {
      kakaoMap.relayout();
      return;
    }
    if (kakaoMapLoading) return;
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      showMapLoadError("JavaScript 키 또는 등록 도메인을 확인해 주세요.");
      return;
    }

    kakaoMapLoading = true;
    window.kakao.maps.load(function () {
      try {
        var center = new window.kakao.maps.LatLng(schoolPosition.lat, schoolPosition.lng);
        kakaoMap = new window.kakao.maps.Map(document.getElementById("kakao-map"), {
          center: center,
          level: 4
        });
        kakaoMap.addControl(new window.kakao.maps.MapTypeControl(), window.kakao.maps.ControlPosition.TOPRIGHT);
        kakaoMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);

        var schoolMarker = new window.kakao.maps.Marker({
          map: kakaoMap,
          position: center,
          title: "용인삼계고등학교"
        });
        var label = document.createElement("button");
        label.className = "school-map-label";
        label.type = "button";
        label.textContent = "용인삼계고등학교";
        label.addEventListener("click", renderSchoolInspector);
        new window.kakao.maps.CustomOverlay({
          map: kakaoMap,
          position: center,
          content: label,
          yAnchor: 0
        });
        window.kakao.maps.event.addListener(schoolMarker, "click", renderSchoolInspector);

        document.getElementById("map-loading").hidden = true;
        kakaoMapLoading = false;
        updateMarkers();
      } catch (error) {
        kakaoMapLoading = false;
        showMapLoadError("지도 초기화 중 오류가 발생했습니다.");
      }
    });
  }

  document.querySelectorAll(".class-tabs button").forEach(function (button) {
    button.addEventListener("click", function () {
      currentClass = button.dataset.class;
      document.querySelectorAll(".class-tabs button").forEach(function (item) {
        var selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
      updateMarkers();
    });
  });

  document.querySelectorAll(".filter-row button").forEach(function (button) {
    button.addEventListener("click", function () {
      currentFilter = button.dataset.filter;
      document.querySelectorAll(".filter-row button").forEach(function (item) {
        item.classList.toggle("active", item === button);
      });
      updateMarkers();
    });
  });

  function updateMarkers() {
    var visibleCount = 0;
    observationMarkers.forEach(function (item) {
      var classes = item.classes;
      var classMatches = currentClass === "all" || classes.indexOf(currentClass) !== -1;
      var kindMatches = currentFilter === "all" || item.kind === currentFilter;
      var visible = classMatches && kindMatches;
      item.overlay.setMap(visible ? kakaoMap : null);
      if (visible) visibleCount += Number(item.count || 0);
    });
    var classText = currentClass === "all" ? "9개 반" : currentClass + "반";
    var filterText = currentFilter === "all" ? "전체 분류" : document.querySelector('[data-filter="' + currentFilter + '"]').textContent.trim();
    document.getElementById("map-summary").textContent = classText + " · " + filterText + " · 관찰 " + visibleCount + "건";
    document.getElementById("map-total-count").textContent = visibleCount;
    document.getElementById("map-inspector").innerHTML = '<div class="inspector-placeholder"><span class="compass-icon">⌖</span><h3>핀을 선택해 보세요</h3><p>현재 필터에 맞는 장소의 생물 기록을 확인할 수 있습니다.</p></div>';
  }

  document.getElementById("locate-button").addEventListener("click", function () {
    ensureKakaoMap();
    if (!navigator.geolocation) {
      showToast("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(function (position) {
      if (!kakaoMap) {
        showToast("지도를 불러온 뒤 다시 시도해 주세요.");
        return;
      }
      var location = new window.kakao.maps.LatLng(position.coords.latitude, position.coords.longitude);
      if (currentLocationMarker) currentLocationMarker.setMap(null);
      currentLocationMarker = new window.kakao.maps.Marker({ map: kakaoMap, position: location, title: "내 위치" });
      kakaoMap.panTo(location);
      showToast("현재 위치로 이동했습니다.");
    }, function () {
      showToast("위치 권한을 허용하면 현재 위치로 이동할 수 있습니다.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  /* Observation location picker */
  function updatePickerConfirmation() {
    var hasName = document.getElementById("specific-location-name").value.trim().length > 0;
    document.getElementById("confirm-location-picker").disabled = !(pendingLocation && hasName);
  }

  function setPickerPosition(latitude, longitude, moveMap) {
    pendingLocation = { lat: latitude, lng: longitude };
    var position = new window.kakao.maps.LatLng(latitude, longitude);
    if (locationPickerMarker) {
      locationPickerMarker.setPosition(position);
      locationPickerMarker.setMap(locationPickerMap);
    } else {
      locationPickerMarker = new window.kakao.maps.Marker({
        map: locationPickerMap,
        position: position,
        title: "선택한 발견 위치"
      });
    }
    if (moveMap) locationPickerMap.panTo(position);
    document.getElementById("picker-status").innerHTML = '<i class="live-dot"></i> 선택 위치 · ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6);
    updatePickerConfirmation();
  }

  function initializeLocationPickerMap() {
    var loading = document.getElementById("picker-map-loading");
    try {
      var start = pendingLocation || schoolPosition;
      var center = new window.kakao.maps.LatLng(start.lat, start.lng);
      if (!locationPickerMap) {
        locationPickerMap = new window.kakao.maps.Map(document.getElementById("location-picker-map"), {
          center: center,
          level: 3
        });
        locationPickerMap.addControl(new window.kakao.maps.MapTypeControl(), window.kakao.maps.ControlPosition.TOPRIGHT);
        locationPickerMap.addControl(new window.kakao.maps.ZoomControl(), window.kakao.maps.ControlPosition.RIGHT);
        window.kakao.maps.event.addListener(locationPickerMap, "click", function (mouseEvent) {
          setPickerPosition(mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng(), false);
        });
      } else {
        locationPickerMap.relayout();
        locationPickerMap.setCenter(center);
      }
      if (pendingLocation) {
        setPickerPosition(pendingLocation.lat, pendingLocation.lng, false);
      } else if (locationPickerMarker) {
        locationPickerMarker.setMap(null);
      }
      loading.hidden = true;
    } catch (error) {
      loading.hidden = false;
      loading.classList.add("error");
      loading.textContent = "카카오맵을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  function openLocationPicker() {
    var modal = document.getElementById("location-picker-modal");
    pickerPreviousFocus = document.activeElement;
    pendingLocation = selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : null;
    document.getElementById("specific-location-name").value = selectedLocation ? selectedLocation.name : "";
    document.getElementById("picker-status").innerHTML = '<i class="live-dot"></i> ' + (pendingLocation ? "저장된 핀을 확인하거나 새 위치를 눌러주세요." : "지도를 눌러 핀을 놓아주세요.");
    document.getElementById("picker-map-loading").hidden = false;
    document.getElementById("picker-map-loading").classList.remove("error");
    document.getElementById("picker-map-loading").textContent = "카카오맵을 불러오는 중입니다…";
    updatePickerConfirmation();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("close-location-picker").focus();

    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      var loading = document.getElementById("picker-map-loading");
      loading.classList.add("error");
      loading.textContent = "카카오맵 SDK를 불러오지 못했습니다.";
      return;
    }
    window.kakao.maps.load(function () {
      window.setTimeout(initializeLocationPickerMap, 0);
    });
  }

  function closeLocationPicker() {
    document.getElementById("location-picker-modal").hidden = true;
    document.body.classList.remove("modal-open");
    if (pickerPreviousFocus && typeof pickerPreviousFocus.focus === "function") pickerPreviousFocus.focus();
  }

  document.getElementById("open-location-picker").addEventListener("click", openLocationPicker);
  document.getElementById("observation-location").addEventListener("click", openLocationPicker);
  document.getElementById("close-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("cancel-location-picker").addEventListener("click", closeLocationPicker);
  document.getElementById("location-picker-modal").addEventListener("click", function (event) {
    if (event.target === this) closeLocationPicker();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !document.getElementById("location-picker-modal").hidden) closeLocationPicker();
  });
  document.getElementById("specific-location-name").addEventListener("input", updatePickerConfirmation);

  document.getElementById("picker-current-location").addEventListener("click", function () {
    if (!navigator.geolocation) {
      showToast("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    var status = document.getElementById("picker-status");
    status.textContent = "현재 위치를 확인하는 중입니다…";
    navigator.geolocation.getCurrentPosition(function (position) {
      if (!locationPickerMap) {
        showToast("지도를 불러온 뒤 다시 시도해 주세요.");
        return;
      }
      setPickerPosition(position.coords.latitude, position.coords.longitude, true);
    }, function () {
      status.innerHTML = '<i class="live-dot"></i> 위치 권한을 허용하거나 지도에서 직접 선택해 주세요.';
      showToast("현재 위치를 가져오지 못했습니다.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  document.getElementById("confirm-location-picker").addEventListener("click", function () {
    var name = document.getElementById("specific-location-name").value.trim();
    if (!pendingLocation || !name) {
      showToast("지도 핀과 구체적인 장소명을 모두 입력해 주세요.");
      return;
    }
    selectedLocation = { lat: pendingLocation.lat, lng: pendingLocation.lng, name: name };
    document.getElementById("observation-location").value = name;
    document.getElementById("observation-latitude").value = selectedLocation.lat.toFixed(7);
    document.getElementById("observation-longitude").value = selectedLocation.lng.toFixed(7);
    var coordinate = document.getElementById("location-coordinate");
    coordinate.textContent = "핀 저장됨 · " + selectedLocation.lat.toFixed(6) + ", " + selectedLocation.lng.toFixed(6);
    coordinate.classList.add("selected");
    closeLocationPicker();
    showToast("발견 위치를 저장했습니다.");
  });

  /* Photo selection */
  document.getElementById("photo-input").addEventListener("change", function (event) {
    var selected = Array.prototype.slice.call(event.target.files || []).slice(0, 3 - photos.length);
    selected.forEach(function (file) {
      var reader = new FileReader();
      reader.addEventListener("load", function () {
        photos.push({ file: file, url: reader.result });
        renderPhotos();
      });
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  });

  function renderPhotos() {
    var list = document.getElementById("photo-list");
    var html = "";
    for (var i = 0; i < 3; i += 1) {
      if (photos[i]) {
        html += '<div class="photo-slot ' + (i === 0 ? "selected" : "") + '" data-photo-index="' + i + '"><img src="' + photos[i].url + '" alt="선택한 생물 사진 ' + (i + 1) + '" /><button class="remove-photo" type="button" data-remove-photo="' + i + '" aria-label="사진 삭제">×</button></div>';
      } else {
        html += '<div class="photo-slot empty"><span>＋</span><small>사진 ' + (i + 1) + '</small></div>';
      }
    }
    list.innerHTML = html;
  }

  document.getElementById("photo-list").addEventListener("click", function (event) {
    var removeButton = event.target.closest("[data-remove-photo]");
    var slot = event.target.closest("[data-photo-index]");
    if (removeButton) {
      event.stopPropagation();
      photos.splice(Number(removeButton.dataset.removePhoto), 1);
      renderPhotos();
      return;
    }
    if (slot) {
      var index = Number(slot.dataset.photoIndex);
      var chosen = photos.splice(index, 1)[0];
      photos.unshift(chosen);
      renderPhotos();
      showToast("대표 사진으로 선택했습니다.");
    }
  });

  /* Mock AI analysis */
  document.getElementById("analyze-button").addEventListener("click", function () {
    var category = document.getElementById("category-select").value;
    var features = document.getElementById("feature-input").value.trim();
    if (!photos.length) {
      showToast("분석할 생물 사진을 한 장 이상 선택해 주세요.");
      return;
    }
    if (!selectedLocation) {
      showToast("지도에서 생물을 발견한 위치를 먼저 선택해 주세요.");
      return;
    }
    if (!category || !features) {
      showToast("생물의 분류와 관찰한 특징을 입력해 주세요.");
      return;
    }
    var button = this;
    button.disabled = true;
    button.innerHTML = "사진과 특징을 비교하는 중…";
    window.setTimeout(function () {
      renderCandidates(candidateData[category] || candidateData.etc);
      document.getElementById("candidate-section").hidden = false;
      button.disabled = false;
      button.innerHTML = "다시 분석하기 <span>✦</span>";
      document.getElementById("candidate-section").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 850);
  });

  function renderCandidates(items) {
    document.getElementById("candidate-list").innerHTML = items.map(function (item, index) {
      return '<button class="candidate-card" type="button" data-candidate-index="' + index + '" data-name="' + item.name + '" data-scientific="' + item.scientific + '">' +
        '<span class="rank">0' + (index + 1) + '</span><span class="candidate-icon">' + item.icon + '</span><h4>' + item.name + '</h4><p>' + item.scientific + '</p><small>' + item.clue + '</small><span class="confidence">' + item.confidence + '</span>' +
      '</button>';
    }).join("");
  }

  document.getElementById("candidate-list").addEventListener("click", function (event) {
    var card = event.target.closest(".candidate-card");
    if (!card) return;
    document.querySelectorAll(".candidate-card").forEach(function (item) { item.classList.toggle("selected", item === card); });
    selectSpecies(card.dataset.name, card.dataset.scientific);
  });

  document.getElementById("manual-identify").addEventListener("click", function () {
    var name = window.prompt("조사한 생물 이름을 입력하세요.", "");
    if (!name) return;
    selectSpecies(name, "학명 데이터베이스 확인 예정");
  });

  function selectSpecies(name, scientific) {
    document.getElementById("selected-species").innerHTML = "<b>최종 후보 · " + escapeHtml(name) + "</b><span>" + escapeHtml(scientific) + "</span>";
    document.getElementById("research-section").hidden = false;
    document.getElementById("research-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.getElementById("finalize-button").addEventListener("click", function () {
    var selected = document.getElementById("selected-species").textContent.trim();
    var reason = document.getElementById("reason-input").value.trim();
    var source = document.getElementById("source-input").value.trim();
    var checked = document.getElementById("research-check").checked;
    if (!selected || !reason || !source || !checked) {
      showToast("동정 근거, 참고 자료와 조사 확인을 모두 작성해 주세요.");
      return;
    }
    showToast("공동 관찰에 학생 동정 완료로 등록했습니다.");
    window.setTimeout(function () { setView("map"); }, 900);
  });

  /* Field guide slots */
  document.getElementById("add-dex-slot").addEventListener("click", function () {
    if (dexLimit >= 5) return;
    dexLimit += 1;
    var card = document.createElement("button");
    card.className = "empty-dex-card";
    card.type = "button";
    card.dataset.go = "discover";
    card.innerHTML = "<span>＋</span><h3>추가 도감 " + dexLimit + "</h3><p>원하면 작성할 수 있는 선택 슬롯입니다.</p>";
    document.getElementById("dex-grid").appendChild(card);
    updateDexProgress();
    showToast("도감 슬롯을 " + dexLimit + "개로 늘렸습니다.");
  });

  function updateDexProgress() {
    var percent = Math.round((2 / dexLimit) * 1000) / 10;
    document.getElementById("dex-limit").textContent = dexLimit;
    document.getElementById("dex-progress-text").textContent = "2 / " + dexLimit;
    document.getElementById("dex-progress-bar").style.width = percent + "%";
    document.getElementById("side-progress-label").textContent = "2 / " + dexLimit;
    document.getElementById("side-progress-bar").style.width = percent + "%";
    if (dexLimit >= 5) {
      document.getElementById("add-dex-slot").disabled = true;
      document.getElementById("add-dex-slot").innerHTML = "최대 5개의 도감 슬롯을 열었습니다";
    }
  }

  function buildClassOverview() {
    var values = [41, 52, 57, 39, 49, 44, 55, 48, 42];
    document.getElementById("class-overview").innerHTML = values.map(function (value, index) {
      var classNumber = index + 1;
      return '<div class="class-cell ' + (classNumber <= 3 ? "active-class" : "") + '"><div><b>' + classNumber + '반</b><span>' + value + '</span></div><p>관찰 ' + value + '건 · 도감 ' + (value + 11) + '개</p></div>';
    }).join("");
  }

  document.getElementById("sync-sheets").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    button.textContent = "동기화 중…";
    window.setTimeout(function () {
      button.disabled = false;
      button.textContent = "지금 동기화";
      showToast("마스터 Google Sheets 동기화 초안입니다.");
    }, 900);
  });

  document.querySelectorAll(".teacher-sidebar nav button").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll(".teacher-sidebar nav button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      if (button.textContent.indexOf("대시보드") === -1) showToast("이 메뉴는 다음 초안에서 연결됩니다.");
    });
  });

  buildClassOverview();
}());
