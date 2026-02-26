// Format content outline URL for drive-utils extraction
// If URL is empty, drive-utils sub-workflow will fail and route via onError
const input = $('1.2_PREP_Input').first().json;
const url = input.content_outline_url || '';

return [{ json: {
  mode: 'EXTRACT_CONTENT',
  google_drive_file_url: url
}}];