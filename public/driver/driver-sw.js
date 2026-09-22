"use strict";

self.addEventListener(
  "push",
  event=>{
    let data = {};

    try{
      data =
        event.data
          ? event.data.json()
          : {};
    }catch{
      data = {
        body:
          event.data
            ? event.data.text()
            : "Trip updated"
      };
    }

    const title =
      String(
        data?.title ||
        "Trip Updated"
      );

    const body =
      String(
        data?.body ||
        "Open GH Mobility to view the latest trip information."
      );

    const url =
      String(
        data?.url ||
        "/driver/trips.html"
      );

    const tag =
      String(
        data?.tag ||
        `trip-${data?.tripId || "update"}`
      );

    event.waitUntil(
      self.registration.showNotification(
        title,
        {
          body,
          tag,
          renotify:true,
          data:{
            url,
            tripId:
              String(
                data?.tripId ||
                ""
              ),
            changeType:
              String(
                data?.changeType ||
                "TRIP_UPDATED"
              )
          }
        }
      )
    );
  }
);

self.addEventListener(
  "notificationclick",
  event=>{
    event.notification.close();

    const targetUrl =
      String(
        event.notification?.data?.url ||
        "/driver/trips.html"
      );

    event.waitUntil(
      (async()=>{
        const clientList =
          await clients.matchAll({
            type:"window",
            includeUncontrolled:true
          });

        for(const client of clientList){
          try{
            const currentUrl =
              new URL(client.url);

            if(
              currentUrl.origin ===
              self.location.origin
            ){
              await client.navigate(
                targetUrl
              );
              return client.focus();
            }
          }catch{}
        }

        return clients.openWindow(
          targetUrl
        );
      })()
    );
  }
);
