MTM ENGINE — AVAILABLE FILE PACKAGE

كل ملف في هذه الحزمة TXT، وأول سطر منه يوضح مساره المقصود داخل المشروع. تتضمن الحزمة الملفات المتاحة من أرشيفات المشروع ذات الصلة بالماركت بليس، إعدادات السيارات، مسار External Trips وTrip Split، والديسبتش.

ملفات تم تجهيزها في نسخة العمل الحالية:
- admin/marketplace-settings.html وadmin/js/marketplace-settings.js: إعدادات Long/Medium/Short، قبول الرحلات، حدود الوصول، بدائل No-show/Cancel، وسحب السيارات والسواقين والخدمات من Driver Schedule مع إعدادات كل سيارة.
- admin/dispatch.html وadmin/dispatch.engine.js: إظهار علامة الرحلة التي تحمل تعيين Marketplace Engine، وتثبيت خيار السائق المرتبط بهذا التعيين في واجهة الديسبتش.
- routes/marketplaceRoutes.js وmodels/MarketplaceSettings.js: حفظ الإعدادات الإضافية وتقييم فئات Long/Medium/Short ومنع إعادة قبول الرحلة المحفوظة.
- models/MarketplaceClaimRecord.js وservices/mtm/marketplaceTripPlanner.js: سجل دائم لمحاولات القبول وقواعد مساعدة للمخطط.

ملفات المكونات الأخرى هي نسخ مصدرية من الأرشيفات التي أرسلتها لتكتمل لديك خريطة المسارات وتقدر تراجع باقي التدفق. هذه ليست نسخة تطبيق كاملة؛ أرشيفات المصدر نفسها لا تحتوي المشروع كله. تعيين Marketplace الظاهر في Dispatch يحتاج أن يصل مع الرحلة من مسار External Trips/Trip Split حتى يظهر لكل سائق في التطبيق.

التحقق: فحص الصياغة لملفات JavaScript المعدلة نجح، واختبارات المخطط نجحت (7 من 7).

قائمة الملفات داخل ZIP:
- admin__broker-review.html.txt
- admin__dispatch.engine.js.txt
- admin__dispatch.html.txt
- admin__dispatch.store.js.txt
- admin__external-trips.html.txt
- admin__js__broker-review.js.txt
- admin__js__external-trips.js.txt
- admin__js__marketplace-settings.js.txt
- admin__js__marketplace.js.txt
- admin__js__tripSplit.js.txt
- admin__marketplace-settings.html.txt
- admin__marketplace.html.txt
- admin__trip-split.html.txt
- models__BrokerIntegration.js.txt
- models__DriverSchedule.js.txt
- models__ExternalTrip.js.txt
- models__MarketplaceActivity.js.txt
- models__MarketplaceClaimRecord.js.txt
- models__MarketplaceConnection.js.txt
- models__MarketplaceSession.js.txt
- models__MarketplaceSettings.js.txt
- models__ProviderPortalMappingProfile.js.txt
- models__Tenant.js.txt
- models__Trip.js.txt
- models__TripSplitState.js.txt
- models__User.js.txt
- routes__brokerReviewRoutes.js.txt
- routes__dispatchFinalConfirmationRoutes.js.txt
- routes__driverScheduleRoutes.js.txt
- routes__externalTripsRoutes.js.txt
- routes__marketplaceRoutes.js.txt
- routes__providerPortalBridgeRoutes.js.txt
- routes__tripSplitRoutes.js.txt
- services__brokerIntegrationService.js.txt
- services__externalTripGeoService.js.txt
- services__externalTripService.js.txt
- services__mtm__marketplaceTripPlanner.js.txt
- services__mtm__mtmApiConnector.js.txt
- services__mtm__mtmConnector.js.txt
- services__mtm__mtmFullTripExtractor.js.txt
- services__mtm__mtmLongTripEngine.js.txt
- services__mtm__mtmMarketplaceWorker.js.txt
- services__mtm__mtmMockConnector.js.txt
- services__mtm__mtmPortalConnector.js.txt
- services__mtm__mtmShortTripEngine.js.txt
- services__mtm__mtmTripLockService.js.txt
- services__mtm__mtmTripNormalizer.js.txt
- services__sharedEngineGoogleRoutes.js.txt
- test__marketplaceTripPlanner.test.js.txt

