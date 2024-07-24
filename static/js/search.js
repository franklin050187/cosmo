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

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const minPrice = urlParams.get('minprice') || 0;
const maxPrice = urlParams.get('maxprice') || 25000000;
const maxCrew = urlParams.get('max-crew') || 1000;
const exlOnly = urlParams.get('brand') || 0;

document.getElementById('min-price').value = minPrice;
document.getElementById('max-price').value = maxPrice;
document.getElementById('max-crew').value = maxCrew;
document.getElementById('exl-only').value = exlOnly;

// check input exl-only if value is not 0
if (exlOnly != 0) {
  document.getElementById('exl-only').checked = true;
}

$(function() {
  // Initialize the price slider
  $("#price-slider").slider({
      range: true,
      min: 0,
      max: 2500000,
      values: [minPrice, maxPrice],
      slide: function(event, ui) {
          // Update the hidden input fields with the selected values
          $("#min-price").val(ui.values[0]);
          $("#max-price").val(ui.values[1]);
      }
  });
});


$(document).ready(function() {
  let jsonData = null; // Variable to store the JSON data

  // Function to fetch the JSON data
  function fetchAuthorsData(callback) {
    if (jsonData) {
      // If the JSON data is already fetched, invoke the callback function
      callback(jsonData);
    } else {
      $.ajax({
        url: "/authors",
        dataType: "json",
        success: function(data) {
          jsonData = data; // Store the fetched JSON data
          callback(jsonData); // Invoke the callback function with the data
        }
      });
    }
  }

    // Function to filter the authors based on the typed characters
    function filterAuthors(request, callback) {
      const filteredAuthors = jsonData.authors.filter(function(author) {
        return author.toLowerCase().includes(request.term.toLowerCase());
      });
      callback(filteredAuthors);
    }

    $("#authorinput").autocomplete({
      source: function(request, response) {
        fetchAuthorsData(function(data) {
          filterAuthors(request, response);
        });
      },
      minLength: 1
    });
  });

      // Function to retrieve the value from the request parameter
      function getParameterValue(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
      }

      // Fill the value in the author input if present in the request parameter
      const authorParam = getParameterValue('author');
      if (authorParam) {
        $('#authorinput').val(authorParam);
      }
    

function selectAuthor() {
  const authorInput = document.getElementById('authorinput');
  const author = authorInput.value;
  addTag('author', author);
}  

const tagList = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers', 'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust','no_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'no_defenses', 'kiter', 'diagonal', 'avoider', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'rammer', 'domination_ship', 'elimination_ship', 'orbiter', 'campaign_ship', 'builtin', 'chaingun', 'large_hyperdrive', 'rocket_thrusters', 'scout/racer', 'broadsider', 'waste_ship', 'debugging_tool', 'sundiver', 'cargo_ship', 'spinner']; // Predefined list of tags
// const infoIcon = document.querySelector('.info-icon');
// infoIcon.setAttribute('data-tags', tagList.join('\n'));

const tagInput = document.getElementById('tag-input');
const tagSuggestionsDiv = document.getElementById('tag-suggestions');
const selectedTagsUl = document.getElementById('selected-tags');
const excludedTagsUl = document.getElementById('excluded-tags');
const finalSearchQuery = document.getElementById('final_search_query');
let matchedTags = [];
let selectedTags = [];
let excludedTags = [];
let fulltext = '';
let ftauthor = '';

// Extract tags from URL parameters on page load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    if (value === '1') {
      if (key !== 'minprice') {
        selectedTags.push(key);
      }
    } else if (value === '0') {
      if (key !== 'minprice') {
        excludedTags.push(key);
      }
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

  matchedTags = tagList.filter(function (tag) {
    const lowercaseTag = tag.toLowerCase();
    return (
      lowercaseTag.includes(filterQuery) &&
      !selectedTags.includes(tag) &&
      !excludedTags.includes(lowercaseTag) &&
      !(isNegativeQuery && excludedTags.includes(lowercaseTag.substring(1)))
    );
  });

  if (isNegativeQuery) {
    matchedTags = matchedTags.map(function (tag) {
      return '-' + tag;
    });
  }

  displayTagSuggestions(matchedTags);
  toggleTableVisibility();
  // console.log(finalSearchQuery.value);

  // remove fulltext= from finalSearchQuery.value
  const fulltextRegex = /\bfulltext=[^ ]*/g;
  finalSearchQuery.value = finalSearchQuery.value.replace(fulltextRegex, '');

  // add tagInput.value to finalSearchQuery.value as parameter "fulltext="
  if (tagInput.value !== '') {
    finalSearchQuery.value += ' ' + 'fulltext=' + tagInput.value;
  }

}


$(tagInput).autocomplete({
  source: function (request, response) {
    const query = request.term.trim();
    const isNegativeQuery = query.startsWith('-');
    const filterQuery = query.substring(isNegativeQuery ? 1 : 0).toLowerCase();

    const matchedTags = tagList.filter(function (tag) {
      const lowercaseTag = tag.toLowerCase();
      return (
        lowercaseTag.includes(filterQuery) &&
        !selectedTags.includes(tag) &&
        !excludedTags.includes(lowercaseTag) &&
        !(isNegativeQuery && excludedTags.includes(lowercaseTag.substring(1)))
      );
    });

    response(matchedTags.map(function (tag) {
      return (isNegativeQuery ? '-' : '') + tag;
    }));
  },
 
  select: function (event, ui) {
    const selectedTag = ui.item.value;
    const isExcluded = selectedTag.startsWith('-');
    const tag = isExcluded ? selectedTag.substring(1) : selectedTag;
    addTag(tag, isExcluded);
    tagInput.value = '';
    return false;
  },
});

function displayTagSuggestions(tags) {
  $(tagSuggestionsDiv).empty();

  if (tags.length === 0) {
    $(tagSuggestionsDiv).hide();
    return;
  }

  const ulElement = $('<ul></ul>');
  tags.forEach(function (tag) {
    const liElement = $('<li></li>').addClass('tag').text(tag);
    liElement.on('click', function () {
      const isExcluded = tag.startsWith('-');
      const selectedTag = isExcluded ? tag.substring(1) : tag;
      addTag(selectedTag, isExcluded);
    });
    ulElement.append(liElement);
  });

  $(tagSuggestionsDiv).html(ulElement);
  $(tagSuggestionsDiv).show();
}

function clearTagSuggestions() {
  $(tagSuggestionsDiv).hide().empty();
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
    $(tagInput).val('');
    clearTagSuggestions();
    filterTags();
    toggleTableVisibility();
    updateFinalSearchQuery();
  }
}

function removeTag(event) {
  const isExcluded = $(event.target).hasClass('excluded-tag');
  const tag = $(event.target).text();
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
  $(selectedTagsUl).empty();

  selectedTags.forEach(function (tag) {
    const tagElement = $('<span></span>').addClass('selected-tag').text(tag);
    tagElement.on('click', removeTag);
    $(selectedTagsUl).append(tagElement);
  });
}

function updateExcludedTagsDisplay() {
  $(excludedTagsUl).empty();

  excludedTags.forEach(function (tag) {
    const tagElement = $('<span></span>').addClass('excluded-tag').text(tag);
    tagElement.on('click', removeTag);
    $(excludedTagsUl).append(tagElement);
  });
}

function toggleTableVisibility() {
  const selectedTagsContainer = $('#selected-tags');
  const excludedTagsContainer = $('#excluded-tags');

  if (selectedTags.length > 0) {
    selectedTagsContainer.show();
  } else {
    selectedTagsContainer.hide();
  }

  if (excludedTags.length > 0) {
    excludedTagsContainer.show();
  } else {
    excludedTagsContainer.hide();
  }
}

function updateFinalSearchQuery() {
  // console.log("updateFinalSearchQuery");
  const formattedExcludedTags = excludedTags.map(tag => '-' + tag);
  // console.log(finalSearchQuery.value);
  finalSearchQuery.value = selectedTags.join(' ') + (formattedExcludedTags.length > 0 ? ' ' + formattedExcludedTags.join(' ') : '');
  // add tagInput.value to selectedTags as parameter "fulltext=" if tagInput.value is not empty
  if (tagInput.value !== '') {
    finalSearchQuery.value += ' ' + 'fulltext=' + tagInput.value;
    tagInput.value = '';
  }

  // console.log(finalSearchQuery.value);
}

function appendSearchInput() {


}

filterTags();
