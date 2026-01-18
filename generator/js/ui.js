// Ugly global variable holding the current card deck
var card_data = [];
var card_options = default_card_options();
var app_settings = default_app_settings();

function default_app_settings() {
    return {
        file_name: 'rpg_cards',
        browser_asks_where_save: false,
        open_save_dialog: false,
        show_download_settings: true,
        page_zoom_keep_ratio: true
    }
}

function mergeSort(arr, compare) {
    if (arr.length < 2)
        return arr;

    var middle = parseInt(arr.length / 2);
    var left = arr.slice(0, middle);
    var right = arr.slice(middle, arr.length);

    return merge(mergeSort(left, compare), mergeSort(right, compare), compare);
}

function merge(left, right, compare) {
    var result = [];

    while (left.length && right.length) {
        if (compare(left[0], right[0]) <= 0) {
            result.push(left.shift());
        } else {
            result.push(right.shift());
        }
    }

    while (left.length)
        result.push(left.shift());

    while (right.length)
        result.push(right.shift());

    return result;
}

function swapInputValues(id1, id2) {
    const field1 = getField(id1);
    const field2 = getField(id2);
    if (field1 && field2) {
        const v1 = field1.getData();
        const v2 = field2.getData();
        field1.changeValue(v2);
        field2.changeValue(v1);
    } else {
        const e1 = document.getElementById(e1);
        const e2 = document.getElementById(e2);
        const v1 = e1.value;
        const v2 = e2.value;
        e1.value = v2;
        e1.dispatchEvent(new Event('input'));
        e2.value = v1;
        e2.dispatchEvent(new Event('input'));
    }
}

function ui_generate() {
    if (card_data.length === 0) {
        alert("Your deck is empty. Please define some cards first, or load the sample deck.");
        return;
    }

    // Generate output HTML
    var { style, html, pages } = card_pages_generate_html(card_data, card_options);

    // Open a new window for the output
    // Use a separate window to avoid CSS conflicts
    var tab = window.open("output.html", 'rpg-cards-output');

    if (!tab || tab.closed || typeof tab.closed === 'undefined') {
        alert(`It looks like your browser blocked the popup window. Please allow popups for this site to continue.`)
    }

    // Send the generated HTML to the new window
    // Use a delay to give the new window time to set up a message listener
    setTimeout(function () {
        tab.postMessage({ style, html, pages, options: card_options }, '*');
    }, 500);
}

function ui_load_sample() {
    // card_data = card_data_example;
    // ui_init_cards(card_data);
    // ui_update_card_list();
    const firstAddedCardIndex = card_data.length;
    ui_add_cards(card_data_example);
    ui_select_card_by_index(firstAddedCardIndex);
}

function ui_clear_all(enableAsking) {
    if (!card_data.length) {
        return true;
    }
    const proceed = enableAsking && document.getElementById('ask-before-delete').checked ? confirm('Delete all cards?') : true;
    if (proceed) {
        card_data = [];
        ui_update_card_list();
        getField('file-name').reset();
    }
    return proceed;
}

function ui_load_files(evt) {
    const target = evt.target;
    const files = target.files;
    const isOpening = Boolean(evt.target.getAttribute('data-opening'));
    const clearAll = Boolean(evt.target.getAttribute('data-clear-all'));
    const isConfigImport = Boolean(evt.target.getAttribute('data-config'));
    const firstAddedCardIndex = card_data.length;

    for (let i = 0; i < files.length; i++) {
        let f = files[i];
        const reader = new FileReader();

        reader.onload = function () {
            const result = (this.result || '').trim();
            if (!result) {
                showToast(`The file ${f.name} is empty.`);
                return;
            }
            try {
                // strip BOM if present
                const clean = result.replace(/^\uFEFF/, '');
                const data = JSON.parse(clean);
                if (isConfigImport) {
                    // Expecting an object with card_options/app_settings/page_layouts OR a direct layout
                    apply_config(data, f.name);
                } else {
                    const newData = legacy_card_data(data);
                    if (isOpening && clearAll) {
                        ui_clear_all(false);
                    }
                    ui_add_cards(newData);
                    if (isOpening) {
                        getField('file-name').changeValue(f.name.replace(/\.[^/.]+$/, ''));
                    } else {
                        ui_select_card_by_index(firstAddedCardIndex);
                    }
                }
            } catch (err) {
                console.error(`Error parsing ${f.name}:`, err);
                showToast(`Error parsing ${f.name}: ${err.message}`, 'danger');
            } finally {
                // ensure we clear the special attributes so subsequent loads behave normally
                $("#file-load").removeAttr('data-config data-opening data-clear-all');
            }
        };

        reader.readAsText(f);
    }

    // Reset file input
    $("#file-load-form")[0].reset();
}

function ui_save_config() {
    const configObject = {
        card_options: card_options,
        app_settings: app_settings
    };
    try {
        const storedLayouts = localStorage.getItem('page_layouts');
        if (storedLayouts) configObject.page_layouts = JSON.parse(storedLayouts);
    } catch (e) {
        console.error('Error reading page_layouts', e);
    }

    const jsonString = JSON.stringify(configObject, null, "  ");
    let filename = (app_settings.file_name || 'rpg_cards') + '_config.json';

    const parts = [jsonString];
    const blob = new Blob(parts, { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = $("#file-save-link")[0];
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

// Compact storage for page layouts to save localStorage space.
// We store layouts as arrays in a fixed field order, which is smaller than object keys.
const LAYOUT_FIELDS = ['page_rows','page_columns','back_bleed_width','back_bleed_height','page_zoom_width','page_zoom_height','page_zoom_keep_ratio','rounded_corners','card_size','page_size','page_width','page_height','card_arrangement'];

function compressLayoutObj(layout) {
    return LAYOUT_FIELDS.map(f => (typeof layout[f] !== 'undefined' ? layout[f] : null));
}

function decompressLayoutArr(arr) {
    const obj = {};
    for (let i = 0; i < LAYOUT_FIELDS.length; i++) {
        const key = LAYOUT_FIELDS[i];
        const val = arr[i];
        if (typeof val !== 'undefined' && val !== null) {
            if (key === 'page_zoom_keep_ratio' || key === 'rounded_corners') {
                obj[key] = Boolean(val);
            } else {
                obj[key] = val;
            }
        }
    }
    return obj;
}

function compressLayoutsMap(layouts) {
    const out = {};
    if (!layouts) return out;
    Object.keys(layouts).forEach(name => {
        const v = layouts[name];
        out[name] = Array.isArray(v) ? v : compressLayoutObj(v);
    });
    return out;
}

function decompressLayoutsMap(layouts) {
    const out = {};
    if (!layouts) return out;
    Object.keys(layouts).forEach(name => {
        const v = layouts[name];
        out[name] = Array.isArray(v) ? decompressLayoutArr(v) : v;
    });
    return out;
}

function get_saved_layouts() {
    try {
        const raw = localStorage.getItem('page_layouts');
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return decompressLayoutsMap(parsed);
    } catch (e) {
        console.error('Error reading page_layouts from localStorage', e);
        return {};
    }
}

function write_saved_layouts(newLayouts) {
    try {
        // Accept either compressed (arrays) or full objects; always write compressed form
        const compressed = compressLayoutsMap(newLayouts);
        localStorage.setItem('page_layouts', JSON.stringify(compressed));
        return true;
    } catch (e) {
        console.error('Error writing page_layouts', e);
        return false;
    }
}

// Backwards-compatible alias that merges into existing layouts (operates on decompressed objects)
function merge_into_saved_layouts(newLayouts) {
    const existing = get_saved_layouts();
    const merged = { ...existing, ...newLayouts };
    return write_saved_layouts(merged);
}

// Make these helpers global so they are callable from apply_config and other places
function ui_set_default_tab_values(options) {
    $("#default-icon-front").val(options.default_icon_front_container);
    $("#default-icon-back").val(options.default_icon_back);
    $("#default-icon-back-container").val(options.default_icon_back_container).trigger("change");
    $("#default-title-size").val(options.default_title_size);
    $("#default-card-font-size").val(options.default_card_font_size);
    $("#default-card-background").val(options.default_background_image);
}

function ui_set_page_tab_values(options) {
   $("#card-size").val(options.card_size).change();
   $("#card-arrangement").val(options.card_arrangement).change();
   $("#page-rows").val(options.page_rows).change();
   $("#page-columns").val(options.page_columns).change();
   $("#back-bleed-width").val(options.back_bleed_width).change();
   $("#back-bleed-height").val(options.back_bleed_height).change();
   $("#page-zoom-keep-ratio").prop('checked', app_settings.page_zoom_keep_ratio);
   $("#page-zoom-width").val(options.page_zoom_width);
   $("#page-zoom-height").val(options.page_zoom_height);
   $("#card-zoom-width").val(options.card_zoom_width);
   $("#card-zoom-height").val(options.card_zoom_height);
   $("#rounded-corners").prop('checked', options.rounded_corners);
}

function apply_config(obj, importFileName) {
    if (!obj || typeof obj !== 'object') return;

    // If config contains card_options / app_settings we apply them (backwards-compatible)
    if (obj.card_options) {
        card_options = legacy_card_options(obj.card_options);
    }
    if (obj.app_settings) {
        app_settings = legacy_app_settings(obj.app_settings);
    }

    // Helper to apply a single layout object to UI
    function apply_layout_object(layout) {
        if (!layout) return;
        card_options.page_rows = layout.page_rows || card_options.page_rows;
        card_options.page_columns = layout.page_columns || card_options.page_columns;
        card_options.back_bleed_width = layout.back_bleed_width || card_options.back_bleed_width;
        card_options.back_bleed_height = layout.back_bleed_height || card_options.back_bleed_height;
        card_options.page_zoom_width = layout.page_zoom_width || card_options.page_zoom_width;
        card_options.page_zoom_height = layout.page_zoom_height || card_options.page_zoom_height;
        app_settings.page_zoom_keep_ratio = (typeof layout.page_zoom_keep_ratio !== 'undefined') ? Boolean(layout.page_zoom_keep_ratio) : app_settings.page_zoom_keep_ratio;
        card_options.rounded_corners = (typeof layout.rounded_corners !== 'undefined') ? Boolean(layout.rounded_corners) : card_options.rounded_corners;
        card_options.card_arrangement = layout.card_arrangement || card_options.card_arrangement;
        // New saved fields
        card_options.card_size = layout.card_size || card_options.card_size;
        card_options.page_size = layout.page_size || card_options.page_size;
        card_options.page_width = layout.page_width || card_options.page_width;
        card_options.page_height = layout.page_height || card_options.page_height;
    }

    // Merge or interpret page_layouts if present
    if (obj.page_layouts) {
        // Normalize keys and overwrite existing saved layouts with imported set
        const keys = Object.keys(obj.page_layouts);
        const normalized = {};
        keys.forEach(k => {
            const layout = obj.page_layouts[k];
            // Try to strip trailing ISO timestamp from provided key
            const base = k.replace(/_[0-9]{4}-[0-9]{2}-[0-9]{2}T.*$/, '').replace(/\s+/g, '_');
            const key = `${base}_${layout.page_rows || 'r'}x${layout.page_columns || 'c'}`;
            normalized[key] = layout;
        });
        const ok = write_saved_layouts(normalized);
        if (!ok) {
            showToast('Erreur lors de la sauvegarde des mises en page importées.', 'danger');
            return;
        }
        const normalizedKeys = Object.keys(normalized);
        if (normalizedKeys.length === 1) {
            // Auto-apply the single imported layout
            apply_layout_object(normalized[normalizedKeys[0]]);
            showToast('Mise en page «' + normalizedKeys[0] + '» importée et appliquée. (Anciennes sauvegardes remplacées)', 'success');
        } else {
            showToast(normalizedKeys.length + ' mises en page importées et ont remplacé les sauvegardes précédentes.', 'success');
        }
    } else if (obj.page_rows || obj.page_columns) {
        // The file itself might be a single layout object (not wrapped). Normalize key from filename and include dimensions.
        const rawName = importFileName ? importFileName.replace(/\.[^/.]+$/, '') : 'imported-layout';
        // Strip trailing ISO timestamp-like suffix if present to keep keys short
        const baseWithoutTs = rawName.replace(/_[0-9]{4}-[0-9]{2}-[0-9]{2}T.*$/, '').replace(/\s+/g, '_');
        const layout = obj;
        const key = `${baseWithoutTs}_${layout.page_rows || 'r'}x${layout.page_columns || 'c'}`;
        // Overwrite saved layouts with this single imported layout under a normalized key
        const ok = write_saved_layouts({ [key]: layout });
        if (ok) {
            apply_layout_object(layout);
            showToast('Mise en page «' + key + '» importée et appliquée. (Anciennes sauvegardes remplacées)', 'success');
        } else {
            showToast('Erreur lors de l\'importation de la mise en page.', 'danger');
        }
    }

    // Update UI to reflect new configuration
    try {
        ui_set_page_tab_values(card_options);
        ui_set_default_tab_values(card_options);
        $('#default-icon-front').val(card_options.default_icon_front);
        $('#default-icon-back').val(card_options.default_icon_back);
        $('#default-title-size').val(card_options.default_title_size);
        $('#default-card-font-size').val(card_options.default_card_font_size);
        local_store_save();
        ui_render_selected_card();
    } catch (e) {
        console.error('Error applying UI updates after import', e);
        try { showToast('La configuration a été importée mais la mise à jour de l\u2019interface a échoué.', 'warning'); } catch (ee) { console.debug('toast failed', ee); }
    }
}

function ui_init_cards(data) {
    return legacy_card_data(data);
}

function ui_add_cards(data) {
    const newData = ui_init_cards(data);
    card_data = card_data.concat(newData);
    ui_update_card_list();
    ui_select_card_by_index(0);
    $("#collapseDeck").collapse('toggle');
}

function ui_add_new_card() {
    card_data.push(legacy_card_data([{
        ...default_card_data(),
        title: 'New card',
        icon_back_container: card_options.default_icon_back_container 
    }])[0]);
    ui_update_card_list();
    ui_select_card_by_index(card_data.length - 1);
}

function ui_duplicate_card() {
    var old_card = ui_selected_card();
    if (old_card && card_data.length > 0) {
        var new_card = $.extend({}, old_card);
        card_data.push(new_card);
        new_card.title = new_card.title + " (Copy)";
        new_card.uuid = crypto.randomUUID();
    } else {
        card_data.push({
        ...default_card_data(),
        uuid: crypto.randomUUID(),
        icon_back_container: card_options.default_icon_back_container 
    });
    }
    ui_update_card_list();
    ui_select_card_by_index(card_data.length - 1);
}

function ui_copy_card() {
    const card = ui_selected_card();
    if (card && card_data.length > 0) {
        navigator.clipboard.writeText(JSON.stringify(card, null, 2)).then(function() {
            showToast('Card "' + card.title + '" was copied to the clipboard');
        }, function() {
            showToast('Failure to copy: Check permissions for clipboard or try with another browser');
        });
    }
}

function ui_copy_all_cards() {
    navigator.clipboard.writeText(JSON.stringify(card_data, null, 2)).then(function() {
        showToast('All cards were copied to the clipboard');
    }, function() {
        showToast('Failure to copy: Check permissions for clipboard or try with another browser');
    });
}

function ui_paste_card() {
    navigator.clipboard.readText().then(function(s) {
        try {
            const prev_data_length = card_data.length;
            const pasted_content = JSON.parse(s);
            const content = Array.isArray(pasted_content) ? pasted_content : [pasted_content];
            content.forEach(c => {
                c.uuid = crypto.randomUUID();
                c.title += " (Pasted)";
                card_data.push(c);
            });
            ui_update_card_list();
            ui_select_card_by_index(prev_data_length);
        } catch (e) {
            alert('Could not paste clipboard as card or list of cards.\n' + e);
        }
    }, function() {
        alert('Failure to paste: Check permissions for clipboard or try with another browser')
    })
}

function ui_select_card_by_index(index) {
    $(`#deck-cards-list .radio:nth-child(${index + 1}) input[type="radio"]`).prop('checked', true);
    ui_update_selected_card();
}

function ui_selected_card_index() {
    const $checkedInput = $('#deck-cards-list input[type="radio"]:checked');
    if (!$checkedInput) return -1;
    return $checkedInput.closest('.radio').index();
}

function ui_selected_card() {
    return card_data[ui_selected_card_index()];
}

function ui_delete_card() {
    var index = ui_selected_card_index();
    if (index === -1) return;
    const proceed = document.getElementById('ask-before-delete').checked ? confirm('Delete ' + card_data[index].title + '?') : true;
    if (!proceed) return;
    card_data.splice(index, 1);
    ui_update_card_list();
    ui_select_card_by_index(Math.min(index, card_data.length - 1));
}

const ui_deck_option_text = (card) => {
    return `${card.count}x ${card.title}`;
}

function ui_update_card_list() {
    $("#total-card-count").text(`Contains ${card_data.length} unique cards, ${card_data.reduce((result, card) => {
        return result + (card?.count || 1) * 1;
    }, 0)} in total.`);

    const $deck = $('#deck-cards-list');

    $deck.children().each(function() {
        const option = this;
        if (!card_data.find(card => card.uuid === option.getAttribute('data-uuid'))) option.remove();
    });

    let i = card_data.length;

    while (i--) {
        var card = card_data[i];
        $option = $deck.find(`[data-uuid="${card.uuid}"]`);
        if (!$option.length) {
            $deck.prepend(`<div class="radio" data-uuid="${card.uuid}"><label><input type="radio" name="deck-option" value="${i}"> <span class="text">${ui_deck_option_text(card)}</span></label></div>`);
        } else if ($option.index() === i) {
            $option.find('.text').text(ui_deck_option_text(card));
        } else {
            $option.find('.text').text(ui_deck_option_text(card));
            $deck.prepend($option.detach());
        }
    }

    ui_update_selected_card();
}

async function ui_save_file() {
    const jsonString = JSON.stringify(card_data, null, "  ");
    let filename = app_settings.file_name;
    
    if (window.showSaveFilePicker) {
        if (app_settings.open_save_dialog) {
            if (!app_settings.browser_asks_where_save) {
                try {
                    const options = {
                        suggestedName: filename + '.json',
                        types: [{
                        description: 'File JSON',
                        accept: { 'application/json': ['.json'] }
                        }]
                    };

                    const handle = await showSaveFilePicker(options);
                    const writable = await handle.createWritable();
                    await writable.write(jsonString);
                    await writable.close();
                    const newFilename = handle.name.split('.').slice(0, -1).join('.');
                    if (newFilename !== filename) getField('file-name').changeValue(newFilename);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        return;
                    }
                    console.error(err);
                }
            }
        }
    }

    const parts = [jsonString];
    const blob = new Blob(parts, { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = $("#file-save-link")[0];
    a.href = url;
    if (filename) {
        a.download = filename 
        ui_save_file_filename = filename;
        a.click();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function ui_update_selected_card() {
    var card = ui_selected_card();
    if (card) {
        $("#card-type").val(card.card_type);
        $("#card-title-size").val(card.title_size);
        $("#card-font-size").val(card.card_font_size);
        $("#card-count").val(card.count);
        $("#card-icon-front").val(card.icon_front);
        $("#card-icon-back").val(card.icon_back);
        $("#card-icon-back-container").val(card.icon_back_container);
        $("#card-icon-back-rotation").val(card.icon_back_rotation);
		$("#card-background").val(card.background_image);
        $("#card-contents").val(card.contents?.join("\n"));
        $("#card-tags").val(card.tags.join(", "));
        getFieldGroup('card').forEach(field => {
            field.changeValue(field.getData(), { updateData: false });
        });
    } else {
        $("#card-type").val("");
        $("#card-title-size").val("");
        $("#card-font-size").val("");
        $("#card-count").val(1);
        $("#card-icon-front").val("");
        $("#card-icon-back").val("");
        $("#card-icon-back-container").val(card_options.default_icon_back_container);
        $("#card-icon-back-rotation").val("");
		$("#card-background").val("");
        $("#card-contents").val("");
        $("#card-tags").val("");
        getFieldGroup('card').forEach(field => field.reset());
    }

    ui_render_selected_card();
    ui_update_card_actions();
}

function ui_filter_selected_card_title() {
    const filterInput = document.querySelector('#deck-cards-list-title-filter');
    const filterValue = filterInput.value;
    const re = new RegExp(filterValue, 'i');
    const clearButton = filterInput.parentElement.querySelector('button');
    const clearButtonLabel = clearButton.querySelector('span');
    clearButton.disabled = !filterValue;
    clearButtonLabel.style.visibility = filterValue ? '' : 'hidden';
    document.querySelectorAll('#deck-cards-list .radio').forEach(option => {
        option.style.display = re.test(option.textContent) ? '' : 'none';
    });
}

function ui_filter_selected_card_title_clear() {
    $('#deck-cards-list-title-filter').focus().val('');
    ui_filter_selected_card_title();
}

function ui_update_card_actions() {
    var action_groups = {};

    // Group actions by category
    for (var function_name in card_action_info) {
        var info = card_action_info[function_name];
        if (!action_groups[info.category]) {
            action_groups[info.category] = [];
        }
        action_groups[info.category].push(function_name);
    }

    var parent = $('#card-actions');
    parent.empty();

    for (var group_name in action_groups) {
        var group_div = $('<div class="action-group"></div>');
        group_div.append($('<h4>' + group_name + '</h4>'));
        var actions = action_groups[group_name];
        for (var i = 0; i < actions.length; ++i) {
            var function_name = actions[i];
            var info = card_action_info[function_name];
            var action_name = info.example.split(" ")[0];

            var button = $('<button type="button" class="btn btn-default btn-sm action-button">' + action_name + '</button>');
            button.attr('title', info.summary);
            button.attr('data-function-name', function_name);
            button.click(function () {
                var contents = $('#card-contents');
                var contentsTextarea = contents[0];
                var function_name = $(this).attr('data-function-name');
                var info = card_action_info[function_name] || {
                    summary: 'Missing summary',
                    example: action_name
                };
                insertTextAtCursor(contentsTextarea, info.example);
                contents.trigger("change");
            });
            group_div.append(button);
        }
        parent.append(group_div);
    }
}

function ui_render_selected_card() {
    var card = ui_selected_card();
    $('#preview-container').empty();
    if (card) {
        var front = card_generate_front(card, card_options, { isPreview: true });
        var back = card_generate_back(card, card_options, { isPreview: true });
        $('#preview-container').html(DOMPurify.sanitize(front + "\n" + back));
    }
    local_store_save();
}

function ui_open_help() {
    $("#help-modal").modal('show');
}

function ui_select_icon() {
    window.open("http://game-icons.net/", "_blank");
}

function ui_page_rotate($event) {
    $event.preventDefault();
    swapInputValues('page-width', 'page-height');
}

function ui_card_rotate($event) {
    $event.preventDefault();
    swapInputValues('card-width', 'card-height');
}

function ui_grid_rotate($event) {
    $event.preventDefault();
    swapInputValues('page-rows', 'page-columns');
}

function ui_zoom_rotate($event) {
    $event.preventDefault();
    swapInputValues('page-zoom-width', 'page-zoom-height');
    swapInputValues('card-zoom-width', 'card-zoom-height');
}

function ui_zoom_100($event) {
    const keepRatio = app_settings.page_zoom_keep_ratio;
    if (keepRatio) app_settings.page_zoom_keep_ratio = false;
    $("#page-zoom-width").val(100).trigger('input');
    $("#page-zoom-height").val(100).trigger('input');
    if (keepRatio) app_settings.page_zoom_keep_ratio = true;
}

function ui_back_bleed_rotate($event) {
    $event.preventDefault();
    swapInputValues('back-bleed-width', 'back-bleed-height');
}

function ui_change_option() {
    var property = $(this).attr("data-option");
    var value;
    if ($(this).attr('type') === 'checkbox') {
        value = $(this).is(':checked');
    } else {
        value = $(this).val();
    }
    switch (property) {
        case 'card_size': {
            const changed = card_options[property] !== value;
            let w, h;
            if (changed) {
                card_options[property] = value;
                [w, h] = value ? value.split(',') : ['', ''];
            } else {
                w = card_options['card_width'];
                h = card_options['card_height'];
            }
            var width = '', height = '';
            var landscape = isLandscape(w, h);
            if (landscape) {
                width = h;  height = w;
            } else {
                width = w;  height = h;
            }
            card_options['card_width'] = width;
            card_options['card_height'] = height;
            $('#card-width').val(width).trigger("input");
            $('#card-height').val(height).trigger("input");
            if (card_options['page_zoom_width'] === '100' && card_options['page_zoom_height'] === '100') {
                $('#card-zoom-width').val(width);
                $('#card-zoom-height').val(height);
            } else {
                $('#card-zoom-width').trigger('input');
            }
            break;
        }
        case 'card_width':
        case 'card_height': {
            card_options[property] = value;
            var width = card_options['card_width'];
            var height = card_options['card_height'];
            ui_set_value_to_format(document.getElementById('card-size'), width, height);
            ui_set_card_custom_size(width, height);
            ui_set_orientation_info('card-orientation', width, height);
            if (card_options['page_zoom_width'] === '100' && card_options['page_zoom_height'] === '100') {
                $('#card-zoom-width').val(width);
                $('#card-zoom-height').val(height);
            } else {
                $('#card-zoom-width').trigger('input');
            }
            break;
        }
        case 'page_zoom_width':
        case 'page_zoom_height':
        case 'card_zoom_width':
        case 'card_zoom_height': {
            const setVal = (k, v, property) => {
                if (k === property) {
                    card_options[k] = value;
                } else {
                    const val = math_format(v);
                    card_options[k] = val;
                    $(`#${k.replace(/_/g, '-')}`).val(val);
                }
            }
            const cardWidth = card_options['card_width'];
            const cardHeight = card_options['card_height'];
            const r = math_eval(`${cardWidth} / ${cardHeight}`);
            if (r) {
                let percWidth;
                let percHeight;
                let sizeWidth;
                let sizeHeight;
                const keepRatio = app_settings.page_zoom_keep_ratio;
                if (property === 'page_zoom_width') {
                    percWidth = value;
                    percHeight = keepRatio ? percWidth : card_options['page_zoom_height'];
                } else if (property === 'page_zoom_height') {
                    percHeight = value;
                    percWidth = keepRatio ? percHeight : card_options['page_zoom_width'];
                } else if (property === 'card_zoom_width') {
                    sizeWidth = value;
                    sizeHeight = keepRatio ? math_eval(`${sizeWidth} / ${r}`) : card_options['card_zoom_height'];
                } else if (property === 'card_zoom_height') {
                    sizeHeight = value;
                    sizeWidth = keepRatio ? math_eval(`${sizeHeight} * ${r}`) : card_options['card_zoom_width'];
                }
                if (isNil(percWidth)) {
                    percWidth = math_eval(`${sizeWidth} / ${cardWidth} * 100`);
                    percHeight = math_eval(`${sizeHeight} / ${cardHeight} * 100`);
                } else {
                    sizeWidth = math_eval(`${cardWidth} * ${percWidth} / 100`);
                    sizeHeight = math_eval(`${cardHeight} * ${percHeight} / 100`);
                }
                setVal('page_zoom_width', percWidth, property);
                setVal('page_zoom_height', percHeight, property);
                setVal('card_zoom_width', sizeWidth, property);
                setVal('card_zoom_height', sizeHeight, property);
            }
            break;
        }
        default: {
            card_options[property] = value;
            break;
        }
    }
    ui_render_selected_card();
}

function ui_set_value_to_format(selectorId, width, height) {
    var selector = typeof selectorId === 'string' ? document.getElementById(selectorId) : selectorId;
    var len = selector.options.length;
    var portrait = "", landscape = "", format = "", o = null;
    for(var i = 0; i < len; i++) {
        o = selector.options[i];
        portrait = [width, height].join(',');
        if (o.value === portrait) { format = portrait; break; }
        landscape = [height, width].join(',');
        if (o.value === landscape) { format = landscape; break; }
    }
    selector.value = format;
}

function ui_set_orientation_info(elementId, cssWidth, cssHeight) {
    var orientation = getOrientation(cssWidth, cssHeight);
    document.getElementById(elementId).textContent = orientation;
    return orientation;
}

function ui_move_top() {
    var idx = ui_selected_card_index();
    if (idx === -1) return;
    card_data.unshift(card_data.splice(idx, 1)[0]);
    ui_update_card_list();
    ui_select_card_by_index(0);
}

function ui_move_bottom() {
    var idx = ui_selected_card_index();
    if (idx === -1) return;
    card_data.push(card_data.splice(idx, 1)[0]);
    ui_update_card_list();
    ui_select_card_by_index(card_data.length - 1);
}

function ui_move_up() {
    var idx = ui_selected_card_index();
    if (idx === -1) return;
    if (idx > 0) {
        [card_data[idx], card_data[idx - 1]] = [card_data[idx - 1], card_data[idx]];
        ui_update_card_list();
        ui_select_card_by_index(idx - 1);
    }
}

function ui_move_down() {
    var idx = ui_selected_card_index();
    if (idx === -1) return;
    if (idx < card_data.length - 1) {
        [card_data[idx], card_data[idx + 1]] = [card_data[idx + 1], card_data[idx]];
        ui_update_card_list();
        ui_select_card_by_index(idx + 1);
    }
}

function ui_change_card_count() {
    var count = $("#card-count").val();
    var card = ui_selected_card();
    if (card) {
        card.count = count;
        $('#deck-cards-list .radio:has(input[type="radio"]:checked) .text').text(ui_deck_option_text(card));
        ui_update_card_list();
    }
}

function ui_change_card_property() {
    var property = $(this).attr("data-property");
    var value = $(this).val();
    var card = ui_selected_card();
    if (card) {
        card[property] = value;
        ui_render_selected_card();
    }
}

function ui_set_card_custom_size(width, height) {
    var card = ui_selected_card();
    if (card) {
        card.card_width = width;
        card.card_height = height;
        ui_render_selected_card();
    }
}

function ui_change_default_icon_front() {
    var value = $(this).val();
    card_options.default_icon_front = value;
    ui_render_selected_card();
}

function ui_change_default_icon_back() {
    var value = $(this).val();
    card_options.default_icon_back = value;
    ui_render_selected_card();
}

function ui_change_default_icon_back_rotation() {
    var value = $(this).val();
    card_options.default_icon_back_rotation = value;
    ui_render_selected_card();
}

function ui_change_default_icon_back_container() {
    var value = $(this).val();
    card_options.default_icon_back_container = value;
    ui_render_selected_card();
}

function ui_change_card_contents() {
    var html = $(this).val();
    var card = ui_selected_card();
    if (card) {
        card.contents = html.split("\n");
        ui_render_selected_card();
    }
}

function ui_change_card_contents_keyup () {
    clearTimeout(ui_change_card_contents_keyup.timeout);
    ui_change_card_contents_keyup.timeout = setTimeout(function () {
        $('#card-contents').trigger('change');
    }, 200);
}
ui_change_card_contents_keyup.timeout = null;

function ui_change_card_tags() {
    var value = $(this).val();

    var card = ui_selected_card();
    if (card) {
        if (value.trim().length === 0) {
            card.tags = [];
        } else {
            card.tags = value.split(",").map(function (val) {
                return val.trim().toLowerCase();
            });
        }
        ui_render_selected_card();
    }
}

function ui_change_default_title_size() {
    card_options.default_title_size = $(this).val();
    ui_render_selected_card();
}

function ui_change_default_icon_size() {
    card_options.icon_inline = $(this).is(':checked');
    ui_render_selected_card();
}

function ui_change_default_card_font_size() {
    card_options.default_card_font_size = $(this).val();
    ui_render_selected_card();
}

function ui_change_default_card_background() {
    card_options.default_background_image = $(this).val();
    ui_render_selected_card();
}

function ui_sort() {
    $("#sort-modal").modal('show');
}

function ui_sort_execute() {
    $("#sort-modal").modal('hide');

    var fn_code = $("#sort-function").val();
    var fn = new Function("card_a", "card_b", fn_code);

    card_data = card_data.sort(function (card_a, card_b) {
        var result = fn(card_a, card_b);
        return result;
    });

    ui_update_card_list();
}

function ui_filter() {
    $("#filter-modal").modal('show');
}

function ui_filter_execute() {
    $("#filter-modal").modal('hide');

    var fn_code = $("#filter-function").val();
    var fn = new Function("card", fn_code);

    card_data = card_data.filter(function (card) {
        var result = fn(card);
        if (result === undefined) return true;
        else return result;
    });

    ui_update_card_list();
}

function ui_apply_default_color_front() {
    const k = 'color_front';
    const v = card_options.default_color_front;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_color_back() {
    const k = 'color_back';
    const v = card_options.default_color_back;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_font_title() {
    const k = 'title_size';
    const v = card_options.default_title_size;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_font_card() {
    const k = 'card_font_size';
    const v = card_options.default_card_font_size;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_icon_front() {
    const k = 'icon_front';
    const v = card_options.default_icon_front;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_icon_back() {
    const k = 'icon_back';
    const v = card_options.default_icon_back;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_icon_back_container() {
    const k = 'icon_back_container';
    const v = card_options.default_icon_back_container;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_icon_back_rotation() {
    const k = 'icon_back_rotation';
    const v = card_options.default_icon_back_rotation;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

function ui_apply_default_card_background() {
    const k = 'background_image';
    const v = card_options.default_background_image;
    card_data.forEach(card => { card[k] = v; }); 
    ui_update_selected_card();
}

//Adding support for local store
function local_store_save () {
    function save() {
       if(window.localStorage){
            const card_data_to_save = card_data.map(c => {
                const card = { ...c };
                delete card.uuid;
                return card;
            });
            try {
                localStorage.setItem('card_data', JSON.stringify(card_data_to_save));
                localStorage.setItem('card_options', JSON.stringify(card_options));
                localStorage.setItem('app_settings', JSON.stringify(app_settings));
            } catch (e){
                //if the local store save failed should we notify the user that the data is not being saved?
                console.log(e);
            }
        }
    }
    // Replace this function with its debounced version
    local_store_save = debounce(save, 500);
    // Call it immediately with the first invocation’s arguments
    return local_store_save.apply(this, arguments);
}

function legacy_card_data(oldData = []) {
    const newData = oldData?.map(oldCard => {
        const card = card_init({ ...oldCard });
        if (!isNil(card.icon)) {
            card.icon_front = card.icon;
            delete card.icon;
        }
        if (!isNil(card.color)) {
            card.color_front = card.color;
            card.color_back = '';
            delete card.color;
        }
        if (isNil(card.icon_back_container)) {
            card.icon_back_container = 'rounded-square';
        }
        if (isNil(card.uuid)) {
            card.uuid = crypto.randomUUID();
        }
        return card;
    });
    return newData;
}

function legacy_card_options(data = {}) {
    const newData = {
        ...default_card_options(),
        ...data
    };
    if (!isNil(newData.page_zoom)) {
        newData.page_zoom_width = newData.page_zoom;
        newData.page_zoom_height = newData.page_zoom;
        delete newData.page_zoom;
    }
    return newData;
}

function legacy_app_settings(data = {}) {
    return {
        ...default_app_settings(),
        ...data
    };
}

function local_store_load() {
    if(window.localStorage){
        try {
            const storedCards = JSON.parse(localStorage.getItem("card_data"));
            if (storedCards) {
                card_data = legacy_card_data(storedCards)
            }
            const storedOptions = JSON.parse(localStorage.getItem("card_options"));
            if (storedOptions) {
                card_options = legacy_card_options(storedOptions);
            }
            const storedSettings = JSON.parse(localStorage.getItem("app_settings"));
            if (storedSettings) {
                app_settings = legacy_app_settings(storedSettings);
            }
        } catch (e){
            //if the local store load failed should we notify the user that the data load failed?
            showToast('Error loading from localStorage', 'danger')
            console.error(e);

        }
    }
}

function showToast(message, type = 'info', duration = 5000) {
  // Create toast element with animation class
  var toastDiv = $('<div class="alert alert-' + type + ' alert-dismissible toast-animate" role="alert" style="min-width: 250px; margin-top: 10px;">' +
                     '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
                       '<span aria-hidden="true">&times;</span>' +
                     '</button>' +
                     message +
                   '</div>');

    $('#toast-container').append(toastDiv);

  // Auto-dismiss after duration
  setTimeout(function () {
    toastDiv.alert('close');
  }, duration);
}

function ui_download_settings_toggle(event) {
    $('#download-settings-opened,#download-settings-closed').toggleClass('hidden');
    app_settings.show_download_settings = event.target.id === ('download-settings-show');
    local_store_save();
}

function ui_zoom_keep_ratio(event) {
    app_settings.page_zoom_keep_ratio = event.target.checked;
    local_store_save();
}

$(document).ready(function () {
    parse_card_actions().then(function () {
        local_store_load();

    // accordion panel collapse fix
    $('#accordion .panel-collapse').on('show.bs.collapse', function(event){
        $('#accordion .panel-collapse').not(event.target).collapse('hide');
    });

    if (!window.showSaveFilePicker) {
        $('#download-settings-available,#download-settings-unavailable').toggleClass('hidden');
    }

    if (app_settings.show_download_settings) {
        $('#download-settings-opened').removeClass('hidden');
    } else {
        $('#download-settings-closed').removeClass('hidden');
    }

    $('#download-settings-show,#download-settings-hide').click(ui_download_settings_toggle);

    $('#danger-zone-show,#danger-zone-hide').click(() => {
        $('#danger-zone-opened,#danger-zone-closed').toggleClass('hidden');
    });

    $('#clear-all').on('click', () => {
        if (confirm('Delete all saved data?\n\nThis will reset the entire app to its original state and erase all saved cards and settings.\n\nMake sure you’ve downloaded your cards before continuing.')) {
            localStorage.clear();
            window.location.reload();
        }
    });



    function ui_reset_group_tab_values(group) {
        if (!confirm('Reset the current tab\'s value?')) return;
        getFieldGroup(group).forEach(field => field.reset());
        if(group === 'page') {
            ui_set_page_tab_values(default_card_options());
        } else if (group === 'default') {
            ui_set_default_tab_values(default_card_options());
        }
    }
    
    UI_FIELDS_CONFIGURATION_PREPARE.forEach((prepareGroupConfig, key) => {
        UI_FIELDS_CONFIGURATION.set(key, prepareGroupConfig());
    });
    UI_FIELDS_CONFIGURATION.forEach(groupConfig => groupConfig.forEach(initField));

    ui_set_page_tab_values(card_options);
    ui_set_default_tab_values(card_options);

    $('#default-icon-front').val(card_options.default_icon_front);
    $('#default-icon-back').val(card_options.default_icon_back);
    $('#default-title-size').val(card_options.default_title_size);
    $('#default-card-font-size').val(card_options.default_card_font_size);

    // Layout save/load helper functions are defined globally to be usable across modules.

    function export_layout_file(name) {
        if (!name) return false;
        // full name (used for filename and as metadata)
        const fullName = name;
        // storage key: base name without timestamp + dimensions (keeps keys short)
        const base = (app_settings.file_name || 'mise_en_page').toString().replace(/\s+/g, '_');
        const storageKey = `${base}_${card_options.page_rows}x${card_options.page_columns}`;

        const layout = {
            page_rows: card_options.page_rows,
            page_columns: card_options.page_columns,
            back_bleed_width: card_options.back_bleed_width,
            back_bleed_height: card_options.back_bleed_height,
            page_zoom_width: card_options.page_zoom_width,
            page_zoom_height: card_options.page_zoom_height,
            page_zoom_keep_ratio: app_settings.page_zoom_keep_ratio,
            rounded_corners: card_options.rounded_corners,
            card_size: card_options.card_size,
            page_size: card_options.page_size,
            page_width: card_options.page_width,
            page_height: card_options.page_height,
            card_arrangement: card_options.card_arrangement,
            // metadata for exported file readability
            _export_name: fullName
        };
        // For exported files we use the short storageKey as the key (clean id) but the file remains human-readable
        const payload = { page_layouts: { [storageKey]: layout } };
        const jsonString = JSON.stringify(payload, null, "  ");
        const filename = (fullName || 'layout') + '.json';
        const parts = [jsonString];
        const blob = new Blob(parts, { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = $("#file-save-link")[0];
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 500);
        // Overwrite local saved layouts with this single layout
        write_saved_layouts(payload.page_layouts);
        showToast('Mise en page «' + name + '» exportée et sauvegardée localement. (Anciennes sauvegardes supprimées)', 'success');
        return true;
    }

    function ui_save_page_layout() {
        // Auto-generate a name based on file name, dimensions and timestamp and export immediately
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = (app_settings.file_name || 'mise_en_page').toString().replace(/\s+/g, '_');
        const name = `${base}_${card_options.page_rows}x${card_options.page_columns}_${timestamp}`;
        export_layout_file(name);
    }

    function get_save_layout(name) {
        if (!name) return null;
        const layouts = get_saved_layouts();
        return layouts[name] || null;
    }

    function ui_apply_saved_layout(name) {
        const layout = get_save_layout(name);
        if (!layout) {
            showToast('Mise en page «' + name + '» introuvable.', 'danger');
            return false;
        }
        // apply only the known layout fields
        const fields = [
            'page_rows','page_columns','back_bleed_width','back_bleed_height',
            'page_zoom_width','page_zoom_height','page_zoom_keep_ratio',
            'rounded_corners','card_arrangement'
        ];
        fields.forEach(f => {
            if (typeof layout[f] !== 'undefined') {
                if (f === 'page_zoom_keep_ratio') {
                    app_settings.page_zoom_keep_ratio = Boolean(layout[f]);
                } else {
                    card_options[f] = layout[f];
                }
            }
        });
        // Update UI and persist
        ui_set_page_tab_values(card_options);
        ui_set_default_tab_values(card_options);
        local_store_save();
        showToast('Mise en page «' + name + '» appliquée.', 'success');
        return true;
    }

    function ui_load_page_layout() {
        // Always open file picker for config import; loader will merge and auto-apply a single imported layout
        $("#file-load").attr({ 'data-config': '1' }).click();
    }

    // Bind buttons
    $('#button-save-layout').click(ui_save_page_layout);
    $('#button-load-layout').click(ui_load_page_layout);

    $('.icon-list').typeahead({
        source: icon_names,
        items: 'all',
        render: function (items) {
          var that = this;

          items = $(items).map(function (i, item) {
            i = $(that.options.item).data('value', item);
            i.find('a').html(that.highlighter(item));
            var classname = 'icon-' + item.split(' ').join('-').toLowerCase();
            i.find('a').append('<span class="' + classname + '"></span>');
            return i[0];
          });

          if (this.autoSelect) {
            items.first().addClass('active');
          }
          this.$menu.html(items);
          return this;
        }
    });

    $("#button-generate").click(ui_generate);
    $("#button-load").click(function () {
        $("#file-load").attr({
            'data-opening': '',
            'data-clear-all': '',
        }).click();
    });
    $("#button-open").click(function () {
        if (card_data.length && document.getElementById('ask-before-delete').checked) {
            if (!confirm('This will delete all cards.\nAre you sure?')) return;
        }
        $("#file-load").attr({
            'data-opening': '1',
            'data-clear-all': '1',
        }).click();
    });
    $("#file-load").change(ui_load_files);
    $("#button-clear").click(function () { ui_clear_all(true); });
    $("#button-load-sample").click(ui_load_sample);
    $("#button-save").click(ui_save_file);
    $("#button-sort").click(ui_sort);
    $("#button-filter").click(ui_filter);
    $("#button-add-card").click(ui_add_new_card);
    $("#button-duplicate-card").click(ui_duplicate_card);
    $("#button-delete-card").click(ui_delete_card);
    $("#button-copy-card").click(ui_copy_card);
    $("#button-copy-all").click(ui_copy_all_cards);
    $("#button-paste-card").click(ui_paste_card);
    $("#button-help").click(ui_open_help);
    $("#button-apply-default-color-front").click(ui_apply_default_color_front);
    $("#button-apply-default-color-back").click(ui_apply_default_color_back);
    $("#button-apply-default-font-title").click(ui_apply_default_font_title);
    $("#button-apply-default-font-card").click(ui_apply_default_font_card);
    $("#button-apply-default-icon-front").click(ui_apply_default_icon_front);
    $("#button-apply-default-icon-back").click(ui_apply_default_icon_back);
    $("#button-apply-default-icon-back-container").click(ui_apply_default_icon_back_container);
    $("#button-apply-default-icon-back-rotation").click(ui_apply_default_icon_back_rotation);
    $("#button-apply-default-card-background").click(ui_apply_default_card_background);

    $("#deck-cards-list").change(ui_update_selected_card);
    $("#deck-cards-list-title-filter").on('input', ui_filter_selected_card_title);
    $("#deck-cards-list-title-filter-clear").click(ui_filter_selected_card_title_clear);

    $("#card-type").change(ui_change_card_property);
    $("#card-title-size").change(ui_change_card_property);
    $("#card-font-size").change(ui_change_card_property);
    $("#card-icon-front").change(ui_change_card_property);
    $("#card-count").change(ui_change_card_count);
    $("#card-icon-back").change(ui_change_card_property);
    $("#card-icon-back-container").change(ui_change_card_property);
    $("#card-icon-back-rotation").change(ui_change_card_property);
	$("#card-background").change(ui_change_card_property);
    $("#card-contents").change(ui_change_card_contents);
    $("#card-tags").change(ui_change_card_tags);

    $("#card-contents").keyup(ui_change_card_contents_keyup);

    $("#page-rotate").click(ui_page_rotate);
    $("#page-rows").change(ui_change_option);
    $("#page-columns").change(ui_change_option);
    $("#page-zoom-width").on("input", ui_change_option);
    $("#page-zoom-height").on("input", ui_change_option);
    $("#page-zoom-rotate").click(ui_zoom_rotate);
    $("#page-zoom-keep-ratio").change(ui_zoom_keep_ratio);
    $('#page-zoom-100').click(ui_zoom_100);
    $("#card-zoom-width").on("input", ui_change_option);
    $("#card-zoom-height").on("input", ui_change_option);
    $("#card-zoom-rotate").click(ui_zoom_rotate);
    $("#grid-rotate").click(ui_grid_rotate);
    $("#card-arrangement").change(ui_change_option);
    $("#card-width").on("input", ui_change_option);
    $("#card-height").on("input", ui_change_option);
    $("#card-size").change(ui_change_option).trigger("change");
    $("#card-rotate").click(ui_card_rotate);
    $("#background-color").change(ui_change_option);
    $("#rounded-corners").change(ui_change_option);
    $("#back-bleed-width").on("input", ui_change_option);
    $("#back-bleed-height").on("input", ui_change_option);
    $("#back-bleed-rotate").click(ui_back_bleed_rotate);

    $("#default-icon-front").change(ui_change_default_icon_front);
    $("#default-icon-back").change(ui_change_default_icon_back)
    $("#default-icon-back-rotation").change(ui_change_default_icon_back_rotation);
    $("#default-icon-back-container").change(ui_change_default_icon_back_container);
    $("#default-title-size").change(ui_change_default_title_size);
    $("#default-card-font-size").change(ui_change_default_card_font_size);
    $("#default-card-background").change(ui_change_default_card_background);

    $("#small-icons").change(ui_change_default_icon_size);
    $("#reset-default-tab-values").click(()=>ui_reset_group_tab_values('default'));
    $("#reset-page-tab-values").click(()=>ui_reset_group_tab_values('page'));

    $(".icon-select-button").click(ui_select_icon);

    $("#sort-execute").click(ui_sort_execute);
    $("#filter-execute").click(ui_filter_execute);

    $("#button-move-top").click(ui_move_top);
    $("#button-move-bottom").click(ui_move_bottom);
    $("#button-move-up").click(ui_move_up);
    $("#button-move-down").click(ui_move_down);

    ui_update_card_list();
    });
});
