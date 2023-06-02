function downloadShip(imageData, imageName) {
    // Convert the base64 image data to a Blob object
    var byteString = atob(imageData);
    var arrayBuffer = new ArrayBuffer(byteString.length);
    var uint8Array = new Uint8Array(arrayBuffer);
    for (var i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    var blob = new Blob([arrayBuffer], { type: 'image/png' });

    // Create a temporary link element and trigger the download
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = imageName ;
    link.click();
}

const tagList = ['cannon', 'deck_cannon', 'emp_missiles', 'flak_battery', 'he_missiles', 'large_cannon', 'mines', 'nukes', 'railgun', 'ammo_factory', 'emp_factory', 'he_factory', 'mine_factory', 'nuke_factory', 'disruptors', 'heavy_laser', 'ion_beam', 'ion_prism', 'laser', 'mining_laser', 'point_defense', 'boost_thruster', 'airlock', 'campaign_factories', 'explosive_charges', 'fire_extinguisher', 'no_fire_extinguishers', 'large_reactor', 'large_shield', 'medium_reactor', 'sensor', 'small_hyperdrive', 'small_reactor', 'small_shield', 'tractor_beams', 'hyperdrive_relay', 'bidirectional_thrust', 'mono_thrust', 'multi_thrust', 'omni_thrust', 'armor_defenses', 'mixed_defenses', 'shield_defenses', 'corvette', 'diagonal', 'flanker', 'mixed_weapons', 'painted', 'unpainted', 'splitter', 'utility_weapons', 'transformer']; // Predefined list of tags
    const infoIcon = document.querySelector('.info-icon');
    infoIcon.setAttribute('data-tags', tagList.join('\n'));
    const selectedTags = [];
    const excludedTags = [];
  
    function searchTags() {
      let query = document.getElementById('tag-input').value;
  
      if (query === '') {
        clearTagSuggestions();
        return;
      }
      const isNegativeQuery = query.startsWith('-');
      if (isNegativeQuery) {
        query = query.substring(1);
      }
      let matchedTags = tagList.filter(function (tag) {
        return tag.toLowerCase().includes(query.toLowerCase()) && (!selectedTags.includes(tag) && !excludedTags.includes(tag));
      });
      if (isNegativeQuery) {
        matchedTags = matchedTags.map(function (tag) {
          return '-' + tag;
        })
      }
      console.log(matchedTags);
      displayTagSuggestions(matchedTags);
      toggleTableVisibility();
    }
  
    function hasSelectedTags() {
      return selectedTags.length > 0;
    }
  
    function toggleTableVisibility() {
        const tagTable = document.getElementById("tag-table");
        const tagInput = document.getElementById("tag-input");
      
        if ((selectedTags.length > 0 || excludedTags.length > 0) || tagInput.value.trim() !== '') {
          tagTable.style.display = "table";
        } else {
          tagTable.style.display = "none";
        }
      }
      
  
    /* function handleTagInput(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTag(document.getElementById('tag-input').value.trim(), false);
      }
    }*/
  
    function displayTagSuggestions(tags) {
      const tagSuggestionsDiv = document.getElementById('tag-suggestions');
      tagSuggestionsDiv.innerHTML = '';
  
      if (tags.length === 0) {
        tagSuggestionsDiv.style.display = 'none';
        return;
      }
  
      const ulElement = document.createElement('ul');
      tags.forEach(function (tag) {
        const liElement = document.createElement('li');
        liElement.className = 'tag';
        liElement.textContent = tag;
        liElement.addEventListener('click', function () {
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
        const tagSuggestionsDiv = document.getElementById('tag-suggestions');
        tagSuggestionsDiv.style.display = 'none';
        tagSuggestionsDiv.innerHTML = '';
        toggleTableVisibility(); // Added to handle table visibility
      }
  
      function addTag(tag, isExcluded) {
        if (tag !== '') {
          if (isExcluded) {
            excludedTags.push(tag);
          } else {
            selectedTags.push(tag);
          }
          updateFinalSearchQuery();
          updateTagsDisplay(isExcluded);
          document.getElementById('tag-input').value = '';
          clearTagSuggestions();
          searchTags(); // Refresh suggested tags after selection
          toggleTableVisibility(); // Added to handle table visibility
        }
      }
  
    function removeTag(event) {
        const isExcluded = event.target.classList.contains('excluded-tag');
        const tag = event.target.textContent;
        const index = isExcluded ? excludedTags.indexOf(tag) : selectedTags.indexOf(tag);
      
        if (index > -1) {
          isExcluded ? excludedTags.splice(index, 1) : selectedTags.splice(index, 1);
          updateFinalSearchQuery();
          updateTagsDisplay(isExcluded);
          searchTags(); // Refresh suggested tags after removal
          toggleTableVisibility(); // Added to handle table visibility
        }
      }
  
    function updateFinalSearchQuery() {
      const finalSearchQuery = document.getElementById('final_search_query');
      finalSearchQuery.value = selectedTags.join(' ') + (excludedTags.length > 0 ? ' -' + excludedTags.join(' -') : '');
    }
  
    // update display
  
    function updateSelectedTagsDisplay() {
      const selectedTagsDiv = document.getElementById('selected-tags');
      selectedTagsDiv.innerHTML = '';
  
      const ulElement = document.createElement('ul');
      selectedTags.forEach(function (tag) {
        const liElement = document.createElement('li');
        liElement.className = 'selected-tag';
        liElement.textContent = tag;
        ulElement.appendChild(liElement);
      });
  
      selectedTagsDiv.appendChild(ulElement);
    }
  
    function updateExcludedTagsDisplay() {
      const excludedTagsDiv = document.getElementById('excluded-tags');
      excludedTagsDiv.innerHTML = '';
  
      const ulElement = document.createElement('ul');
      excludedTags.forEach(function (tag) {
        const liElement = document.createElement('li');
        liElement.className = 'excluded-tag';
        liElement.textContent = tag;
        ulElement.appendChild(liElement);
      });
  
      excludedTagsDiv.appendChild(ulElement);
    }
  
    function updateTagsDisplay(isExcluded) {
      if (isExcluded) {
        updateExcludedTagsDisplay();
      } else {
        updateSelectedTagsDisplay();
      }
    }
  
    function appendSearchInput() {
      const input = document.getElementById('tag-input').value;
      const selectedTagsInput = document.getElementById('final_search_query');
      selectedTagsInput.value += " " + input;
    }