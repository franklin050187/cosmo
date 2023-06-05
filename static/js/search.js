function downloadShip(imageUrl) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/download/" + imageUrl, true);
  xhr.responseType = "blob"; // Set the response type to 'blob' to handle binary data
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      // Create a temporary link element to download the file
      var link = document.createElement("a");
      link.href = window.URL.createObjectURL(xhr.response);
      link.download = xhr.getResponseHeader("Content-Disposition").split("filename=")[1];
      link.click();
    }
  };
  xhr.send();
}


const tagList = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers', 'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']; // Predefined list of tags
const infoIcon = document.querySelector('.info-icon');
infoIcon.setAttribute('data-tags', tagList.join('\n'));


const tagInput = document.getElementById('tag-input');
const tagSuggestionsDiv = document.getElementById('tag-suggestions');
const selectedTagsUl = document.getElementById('selected-tags');
const excludedTagsUl = document.getElementById('excluded-tags');
const finalSearchQuery = document.getElementById('final_search_query');
let matchedTags = [];
let selectedTags = [];
let excludedTags = [];

// Extract tags from URL parameters on page load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    if (value === '1') {
      selectedTags.push(key);
    } else if (value === '0') {
      excludedTags.push(key);
    }
  });
  updateSelectedTagsDisplay();
  updateExcludedTagsDisplay();
  updateFinalSearchQuery();
  filterTags();
  toggleTableVisibility();
});

tagInput.addEventListener('input', filterTags);

function filterTags() {
  const query = tagInput.value.trim();
  matchedTags = [];

  if (query === '') {
    clearTagSuggestions();
    return;
  }

  const isNegativeQuery = query.startsWith('-');
  const filterQuery = query.substring(isNegativeQuery ? 1 : 0).toLowerCase();

  matchedTags = tagList.filter(function(tag) {
    const lowercaseTag = tag.toLowerCase();
    return (
      lowercaseTag.includes(filterQuery) &&
      !selectedTags.includes(tag) &&
      !excludedTags.includes(tag) &&
      !(isNegativeQuery && excludedTags.includes(lowercaseTag.substring(1)))
    );
  });

  if (isNegativeQuery) {
    matchedTags = matchedTags.map(function(tag) {
      return '-' + tag;
    });
  }

  displayTagSuggestions(matchedTags);
  toggleTableVisibility();
}

function displayTagSuggestions(tags) {
  tagSuggestionsDiv.innerHTML = '';

  if (tags.length === 0) {
    tagSuggestionsDiv.style.display = 'none';
    return;
  }

  const ulElement = document.createElement('ul');
  tags.forEach(function(tag) {
    const liElement = document.createElement('li');
    liElement.className = 'tag';
    liElement.textContent = tag;
    liElement.addEventListener('click', function() {
      if (tag[0] === '-') {
        addTag(tag.substring(1), true);
      } else {
        addTag(tag, false);
      }
    });
    ulElement.appendChild(liElement);
  });

  tagSuggestionsDiv.style.display = 'block';
  tagSuggestionsDiv.appendChild(ulElement);
}

function clearTagSuggestions() {
  tagSuggestionsDiv.style.display = 'none';
  tagSuggestionsDiv.innerHTML = '';
  toggleTableVisibility();
}

function addTag(tag, isExcluded) {
  if (tag !== '') {
    if (isExcluded) {
      excludedTags.push(tag);
      updateExcludedTagsDisplay();
    } else {
      selectedTags.push(tag);
      updateSelectedTagsDisplay();
    }
    tagInput.value = '';
    clearTagSuggestions();
    filterTags();
    toggleTableVisibility();
    updateFinalSearchQuery();
  }
}

function removeTag(event) {
  const isExcluded = event.target.classList.contains('excluded-tag');
  const tag = event.target.textContent;
  const index = isExcluded ? excludedTags.indexOf(tag) : selectedTags.indexOf(tag);

  if (index > -1) {
    isExcluded ? excludedTags.splice(index, 1) : selectedTags.splice(index, 1);
    updateSelectedTagsDisplay();
    updateExcludedTagsDisplay();
    filterTags();
    toggleTableVisibility();
    updateFinalSearchQuery();
  }
}

function updateSelectedTagsDisplay() {
  selectedTagsUl.innerHTML = '';

  selectedTags.forEach(function(tag) {
    const tagElement = document.createElement('span');
    tagElement.className = 'selected-tag';
    tagElement.textContent = tag;
    tagElement.addEventListener('click', removeTag); // Add click event listener to remove the tag
    selectedTagsUl.appendChild(tagElement);
  });
}

function updateExcludedTagsDisplay() {
  excludedTagsUl.innerHTML = '';

  excludedTags.forEach(function(tag) {
    const tagElement = document.createElement('span');
    tagElement.className = 'excluded-tag';
    tagElement.textContent = tag;
    tagElement.addEventListener('click', removeTag); // Add click event listener to remove the tag
    excludedTagsUl.appendChild(tagElement);
  });
}

function toggleTableVisibility() {
  const selectedTagsContainer = document.getElementById('selected-tags');
  const excludedTagsContainer = document.getElementById('excluded-tags');

  if (selectedTags.length > 0) {
    selectedTagsContainer.style.display = 'block';
  } else {
    selectedTagsContainer.style.display = 'none';
  }

  if (excludedTags.length > 0) {
    excludedTagsContainer.style.display = 'block';
  } else {
    excludedTagsContainer.style.display = 'none';
  }
}

function updateFinalSearchQuery() {
  finalSearchQuery.value = selectedTags.join(' ') + (excludedTags.length > 0 ? ' -' + excludedTags.join(' -') : '');
}

function appendSearchInput() {
  const input = tagInput.value.trim();
  if (input !== '') {
    finalSearchQuery.value += ' ' + input;
    tagInput.value = '';
    clearTagSuggestions();
    filterTags();
    toggleTableVisibility();
    updateFinalSearchQuery();
  }
}

filterTags();
