'use strict';
require('dotenv').config();
const { ensureProperties, PROPERTIES } = require('../lib/hubspot');
(async () => {
  if (!process.env.HUBSPOT_TOKEN) { console.error('HUBSPOT_TOKEN is not set.'); process.exit(1); }
  try {
    const created = await ensureProperties();
    console.log(created.length ? 'Created: ' + created.join(', ') : 'All properties already exist.');
    console.log('Total managed properties: ' + PROPERTIES.length);
  } catch (e) {
    if (String(e.message).includes('403')) {
      console.error('\nHubSpot refused: the private app lacks the schema scope.\n');
      console.error('Add crm.schemas.contacts.read and crm.schemas.contacts.write to the');
      console.error('private app, commit the change, and put the NEW token in HUBSPOT_TOKEN.\n');
      console.error('If your HubSpot tier does not expose that scope, you can skip this entirely.');
      console.error('The service already handles it: contacts are still created, the proposal PDF');
      console.error('is still attached, and the full calculation is written into the note body.');
      console.error('You would only lose the filterable calc_* fields. To add them by hand instead,');
      console.error('go to Settings > Properties > Create property on the Contact object:\n');
      PROPERTIES.forEach(p => console.error('  ' + p.label + '  (internal name: ' + p.name + ', type: ' + p.type + ')'));
      console.error('');
      process.exit(1);
    }
    console.error('Failed:', e.message); process.exit(1);
  }
})();
