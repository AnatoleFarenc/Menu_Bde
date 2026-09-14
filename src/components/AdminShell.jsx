import React from 'react';
import IconRail from './IconRail';
import EventSidebar from './EventSidebar';
import EventHeader from './EventHeader';
import StorefrontTabs from './StorefrontTabs';
import KitchenDashboard from './KitchenDashboard';

// The management tool's shell: icon rail (sections) + event list + the
// selected event's header and storefront tabs, wrapping whichever section
// is active. Deliberately full-bleed and visually distinct from the
// storefront (see .admin-modern / .admin-shell in index.css) -- this is the
// internal tool, not the public site.
export default function AdminShell({
  activeSection,
  onSelectSection,
  events,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onUpdateEvent,
  storefronts,
  selectedStorefront,
  onSelectStorefront,
  onCreateStorefront,
  onDuplicateStorefront,
  onActivateStorefront,
  onDeleteStorefront,
  ...contentProps
}) {
  return (
    <div className="admin-modern admin-shell">
      <IconRail activeSection={activeSection} onSelectSection={onSelectSection} />
      <EventSidebar
        events={events}
        selectedEventId={selectedEvent?.id}
        onSelectEvent={onSelectEvent}
        onCreateEvent={onCreateEvent}
        onDuplicateEvent={onDuplicateEvent}
        onDeleteEvent={onDeleteEvent}
      />
      <div className="admin-shell-main">
        <EventHeader event={selectedEvent} onUpdateEvent={onUpdateEvent} />
        <StorefrontTabs
          storefronts={storefronts}
          selectedStorefrontId={selectedStorefront?.id}
          onSelect={onSelectStorefront}
          onCreate={onCreateStorefront}
          onDuplicate={onDuplicateStorefront}
          onActivate={onActivateStorefront}
          onDelete={onDeleteStorefront}
        />
        <div className="admin-shell-content">
          <KitchenDashboard
            activeSection={activeSection}
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={onSelectEvent}
            onDuplicateEvent={onDuplicateEvent}
            {...contentProps}
          />
        </div>
      </div>
    </div>
  );
}
