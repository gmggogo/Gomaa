"use strict";

const HelpCenter = (()=>{

  const state = {
    index:null,
    articles:[],
    role:"ADMIN",
    brokerEnabled:false,
    sharedEnabled:false,
    page:"",
    lang:localStorage.getItem("ghHelpLanguage") || "en"
  };

  const $ = id=>document.getElementById(id);

  const UI = {
    en:{
      title:"Help Center",
      subtitle:"Choose a page or search for the task you need.",
      language:"Language",
      standardPages:"Admin Pages",
      standardPagesSub:"Core Admin pages in the same order used by the Admin header.",
      brokerPages:"Broker Operations Pages",
      brokerPagesSub:"Broker-only pages are kept separate from the regular Admin workflow.",
      allPages:"All accessible pages",
      showAll:"Show All Pages",
      search:"Example: change pickup time, assign driver, add broker trip...",
      loading:"Loading help...",
      noResults:"No matching help article is available for your role and enabled features.",
      result:"result",
      results:"results",
      in:"in",
      for:"for",
      tasks:"help tasks",
      task:"help task",
      page:"Page",
      startHelp:"Choose a page or type a task in the search box to see the instructions."
    },
    "es-MX":{
      title:"Centro de ayuda",
      subtitle:"Elige una página o busca la tarea que necesitas.",
      language:"Idioma",
      standardPages:"Páginas de Admin",
      standardPagesSub:"Páginas principales de Admin en el mismo orden del encabezado.",
      brokerPages:"Páginas de Operaciones de Broker",
      brokerPagesSub:"Las páginas exclusivas de Broker están separadas del flujo normal de Admin.",
      allPages:"Todas las páginas disponibles",
      showAll:"Mostrar todas las páginas",
      search:"Ejemplo: cambiar hora de recogida, asignar conductor, agregar viaje de broker...",
      loading:"Cargando ayuda...",
      noResults:"No hay un artículo de ayuda disponible para tu rol y las funciones habilitadas.",
      result:"resultado",
      results:"resultados",
      in:"en",
      for:"para",
      tasks:"tareas de ayuda",
      task:"tarea de ayuda",
      page:"Página",
      startHelp:"Elige una página o escribe una tarea en el buscador para ver las instrucciones."
    },
    ar:{
      title:"مركز المساعدة",
      subtitle:"اختر صفحة أو ابحث عن المهمة التي تريد تنفيذها.",
      language:"اللغة",
      standardPages:"صفحات الأدمن",
      standardPagesSub:"صفحات الأدمن الأساسية مرتبة بنفس ترتيب الهيدر.",
      brokerPages:"صفحات عمليات البروكر",
      brokerPagesSub:"صفحات البروكر منفصلة عن صفحات التشغيل العادية.",
      allPages:"كل الصفحات المتاحة",
      showAll:"عرض كل الصفحات",
      search:"مثال: تغيير وقت البيك أب، تعيين سائق، إضافة رحلة بروكر...",
      loading:"جارٍ تحميل المساعدة...",
      noResults:"لا توجد نتيجة مساعدة مطابقة لدورك والخصائص المفعلة.",
      result:"نتيجة",
      results:"نتائج",
      in:"في",
      for:"عن",
      tasks:"مهام مساعدة",
      task:"مهمة مساعدة",
      page:"الصفحة",
      startHelp:"اختر صفحة أو اكتب المهمة في البحث لعرض خطوات التنفيذ."
    },
    fr:{
      title:"Centre d’aide",
      subtitle:"Choisissez une page ou recherchez la tâche dont vous avez besoin.",
      language:"Langue",
      standardPages:"Pages Admin",
      standardPagesSub:"Pages Admin principales dans le même ordre que l’en-tête.",
      brokerPages:"Pages des opérations Broker",
      brokerPagesSub:"Les pages réservées au Broker sont séparées du flux Admin normal.",
      allPages:"Toutes les pages accessibles",
      showAll:"Afficher toutes les pages",
      search:"Exemple : modifier l’heure de prise en charge, affecter un chauffeur, ajouter un trajet broker...",
      loading:"Chargement de l’aide...",
      noResults:"Aucun article d’aide correspondant n’est disponible pour votre rôle et les fonctions activées.",
      result:"résultat",
      results:"résultats",
      in:"dans",
      for:"pour",
      tasks:"tâches d’aide",
      task:"tâche d’aide",
      page:"Page",
      startHelp:"Choisissez une page ou saisissez une tâche dans la recherche pour voir les instructions."
    },
    it:{
      title:"Centro assistenza",
      subtitle:"Scegli una pagina oppure cerca l’attività di cui hai bisogno.",
      language:"Lingua",
      standardPages:"Pagine Admin",
      standardPagesSub:"Pagine Admin principali nello stesso ordine dell’header.",
      brokerPages:"Pagine Operazioni Broker",
      brokerPagesSub:"Le pagine dedicate al Broker sono separate dal normale flusso Admin.",
      allPages:"Tutte le pagine accessibili",
      showAll:"Mostra tutte le pagine",
      search:"Esempio: cambia orario pickup, assegna autista, aggiungi corsa broker...",
      loading:"Caricamento assistenza...",
      noResults:"Nessun articolo di assistenza corrispondente è disponibile per il tuo ruolo e le funzioni abilitate.",
      result:"risultato",
      results:"risultati",
      in:"in",
      for:"per",
      tasks:"attività di assistenza",
      task:"attività di assistenza",
      page:"Pagina",
      startHelp:"Scegli una pagina oppure scrivi un’attività nella ricerca per vedere le istruzioni."
    }
  };

  const PAGE_DESC = {
    "dashboard.html":{
      "es-MX":"Muestra totales de viajes, alertas, actividad de brokers, operaciones de hoy y resúmenes mensuales.",
      ar:"يعرض إجمالي الرحلات والتنبيهات ونشاط البروكر وعمليات اليوم والملخصات الشهرية.",
      fr:"Affiche les totaux des trajets, les alertes, l’activité broker, les opérations du jour et les résumés mensuels.",
      it:"Mostra totali corse, avvisi, attività broker, operazioni di oggi e riepiloghi mensili."
    },
    "trips-hub.html":{
      "es-MX":"Centro principal para agregar, buscar, filtrar, editar y eliminar viajes activos.",
      ar:"المركز الرئيسي لإضافة الرحلات النشطة والبحث عنها وفلترتها وتعديلها وحذفها.",
      fr:"Centre principal pour ajouter, rechercher, filtrer, modifier et supprimer les trajets actifs.",
      it:"Centro principale per aggiungere, cercare, filtrare, modificare ed eliminare corse attive."
    },
    "trips.html":{
      "es-MX":"Muestra viajes activos, selección, edición individual/compartida y preparación para Dispatch.",
      ar:"يعرض الرحلات النشطة وأدوات الاختيار وتعديل الرحلات الفردية والمشتركة وتجهيزها للديسباتش.",
      fr:"Affiche les trajets actifs, la sélection, la modification individuelle/partagée et la préparation au Dispatch.",
      it:"Mostra corse attive, selezione, modifica individuale/condivisa e preparazione al Dispatch."
    },
    "external-trips.html":{
      "es-MX":"Recibe y administra viajes externos de brokers antes de Trip Split.",
      ar:"يستقبل ويدير رحلات البروكر الخارجية قبل Trip Split.",
      fr:"Reçoit et gère les trajets externes des brokers avant Trip Split.",
      it:"Riceve e gestisce le corse esterne dei broker prima di Trip Split."
    },
    "trip-split.html":{
      "es-MX":"Agrupa viajes de broker como individuales o compartidos y envía los resultados confirmados a Broker Review.",
      ar:"يقسم رحلات البروكر إلى فردية أو مشتركة ويرسل النتائج المؤكدة إلى Broker Review.",
      fr:"Regroupe les trajets broker en trajets individuels ou partagés et envoie les résultats confirmés à Broker Review.",
      it:"Raggruppa le corse broker come individuali o condivise e invia i risultati confermati a Broker Review."
    },
    "broker-review.html":{
      "es-MX":"Revisa viajes de broker, permite editarlos, confirmarlos o regresarlos a Trip Split.",
      ar:"يراجع رحلات البروكر ويسمح بتعديلها أو تأكيدها أو إرجاعها إلى Trip Split.",
      fr:"Révise les trajets broker, permet de les modifier, les confirmer ou les renvoyer à Trip Split.",
      it:"Revisiona le corse broker, consente modifica, conferma o ritorno a Trip Split."
    },
    "dispatch.html":{
      "es-MX":"Asigna conductores y vehículos, ejecuta Auto Assign, envía viajes y administra asignaciones.",
      ar:"يعيّن السائقين والسيارات ويشغل Auto Assign ويرسل الرحلات ويدير التعيينات.",
      fr:"Affecte chauffeurs et véhicules, exécute Auto Assign, envoie les trajets et gère les affectations.",
      it:"Assegna autisti e veicoli, esegue Auto Assign, invia corse e gestisce le assegnazioni."
    },
    "dispatch-final-confirmation.html":{
      "es-MX":"Revisa viajes pendientes del procesamiento final y confirma el estado final del viaje/pasajero.",
      ar:"يراجع الرحلات المنتظرة للمعالجة النهائية ويؤكد الحالة النهائية للرحلة أو الراكب.",
      fr:"Révise les trajets en attente du traitement final et confirme l’état final du trajet/passager.",
      it:"Revisiona le corse in attesa dell’elaborazione finale e conferma lo stato finale corsa/passeggero."
    },
    "dispatch-review.html":{
      "es-MX":"Revisa viajes completados, cancelados, No Show y Not Completed con filtros y exportación.",
      ar:"يراجع الرحلات المكتملة والملغاة وNo Show وNot Completed مع الفلاتر والتصدير.",
      fr:"Révise les trajets terminés, annulés, No Show et Not Completed avec filtres et export.",
      it:"Revisiona corse completate, annullate, No Show e Not Completed con filtri ed esportazione."
    },
    "driver-schedule.html":{
      "es-MX":"Administra disponibilidad del conductor, días de trabajo, horario y servicio asignado.",
      ar:"يدير حالة السائق وأيام العمل والجدول والخدمة المخصصة له.",
      fr:"Gère la disponibilité du chauffeur, les jours de travail, le planning et le service affecté.",
      it:"Gestisce disponibilità autista, giorni di lavoro, programma e servizio assegnato."
    },
    "maps.html":{
      "es-MX":"Muestra ubicaciones en vivo de conductores y ayuda a localizar conductores activos.",
      ar:"يعرض مواقع السائقين مباشرة ويساعد في العثور على السائقين النشطين.",
      fr:"Affiche la position en direct des chauffeurs et aide à localiser les chauffeurs actifs.",
      it:"Mostra le posizioni live degli autisti e aiuta a trovare gli autisti attivi."
    },
    "summary.html":{
      "es-MX":"Reportes operativos con filtros por fuente, facility, servicio, estado y fecha, más exportación.",
      ar:"تقارير تشغيلية بفلاتر المصدر والشركة والخدمة والحالة والتاريخ مع الطباعة والتصدير.",
      fr:"Rapports opérationnels avec filtres source, facility, service, statut et date, plus export.",
      it:"Report operativi con filtri per origine, facility, servizio, stato e data, più esportazione."
    },
    "external-summary.html":{
      "es-MX":"Reportes de broker para viajes cerrados con filtros, impresión, CSV y Excel.",
      ar:"تقارير البروكر للرحلات المغلقة مع الفلاتر والطباعة وCSV وExcel.",
      fr:"Rapports broker pour trajets clôturés avec filtres, impression, CSV et Excel.",
      it:"Report broker per corse chiuse con filtri, stampa, CSV ed Excel."
    },
    "users.html":{
      "es-MX":"Crea y administra Super Admin, Admin, Dispatcher, Driver y Company.",
      ar:"ينشئ ويدير حسابات Super Admin وAdmin وDispatcher وDriver وCompany.",
      fr:"Crée et gère les comptes Super Admin, Admin, Dispatcher, Driver et Company.",
      it:"Crea e gestisce account Super Admin, Admin, Dispatcher, Driver e Company."
    },
    "refunds.html":{
      "es-MX":"Revisa registros de reembolso y las acciones disponibles para procesarlos.",
      ar:"يراجع سجلات الاسترداد والإجراءات المتاحة لمعالجتها.",
      fr:"Révise les dossiers de remboursement et les actions disponibles pour les traiter.",
      it:"Revisiona i rimborsi e le azioni disponibili per elaborarli."
    },
    "admin-billing.html":{
      "es-MX":"Administra Stripe, facturación del tenant, facturas, estado de pago y bloqueo/desbloqueo de compañías.",
      ar:"يدير Stripe وفوترة التانت والفواتير وحالة الدفع وقفل أو فتح الشركات.",
      fr:"Gère Stripe, la facturation du tenant, les factures, le statut de paiement et le verrouillage/déverrouillage des sociétés.",
      it:"Gestisce Stripe, fatturazione tenant, fatture, stato pagamento e blocco/sblocco aziende."
    },
    "payments.html":{
      "es-MX":"Revisa pagos SaaS y permite pagar facturas de la plataforma.",
      ar:"يراجع حالة دفع الـSaaS ويسمح بدفع فواتير المنصة.",
      fr:"Révise les paiements SaaS et permet de payer les factures de la plateforme.",
      it:"Controlla i pagamenti SaaS e permette di pagare le fatture della piattaforma."
    },
    "payroll.html":{
      "es-MX":"Configura periodos de nómina, horarios, tarifas y ajustes de ingresos.",
      ar:"يضبط فترات الرواتب والجداول والأسعار وإعدادات الأرباح.",
      fr:"Configure les périodes de paie, plannings, taux et paramètres de rémunération.",
      it:"Configura periodi paga, programmi, tariffe e impostazioni guadagni."
    },
    "payroll-summary.html":{
      "es-MX":"Resume la nómina por Drivers, Dispatchers, Admins y Super Admins.",
      ar:"يلخص الرواتب حسب Drivers وDispatchers وAdmins وSuper Admins.",
      fr:"Résume la paie par Drivers, Dispatchers, Admins et Super Admins.",
      it:"Riepiloga la paga per Drivers, Dispatchers, Admins e Super Admins."
    },
    "tax-report.html":{
      "es-MX":"Genera, guarda, imprime y exporta reportes fiscales de compañías por rango de fechas.",
      ar:"ينشئ ويحفظ ويطبع ويصدر تقارير الضرائب للشركات حسب فترة التاريخ.",
      fr:"Génère, enregistre, imprime et exporte les rapports fiscaux des sociétés par période.",
      it:"Genera, salva, stampa ed esporta report fiscali aziendali per intervallo date."
    },
    "service-management.html":{
      "es-MX":"Controla precios de servicios, cancelaciones, ventanas de aviso, política Add Stop y temporizadores del conductor.",
      ar:"يدير أسعار الخدمات وسياسات الإلغاء وفترات التحذير وسياسة Add Stop وتايمرات السائق.",
      fr:"Gère les tarifs des services, annulations, fenêtres d’alerte, politique Add Stop et minuteries chauffeur.",
      it:"Gestisce prezzi servizi, cancellazioni, finestre di avviso, politica Add Stop e timer autista."
    },
    "facility-pricing-override.html":{
      "es-MX":"Define precios especiales por Company/Facility en lugar del precio predeterminado del servicio.",
      ar:"يحدد أسعارًا خاصة للشركة أو Facility بدل سعر الخدمة الافتراضي.",
      fr:"Définit des tarifs spécifiques Company/Facility à la place du tarif de service par défaut.",
      it:"Imposta prezzi specifici per Company/Facility invece del prezzo servizio predefinito."
    },
    "broker-pricing.html":{
      "es-MX":"Define precios específicos por broker y reglas de cobro del broker.",
      ar:"يحدد أسعارًا خاصة بكل بروكر وقواعد الرسوم الخاصة به.",
      fr:"Définit les tarifs spécifiques par broker et les règles de facturation broker.",
      it:"Imposta prezzi specifici per broker e relative regole di addebito."
    },
    "system-design.html":{
      "es-MX":"Ajustes generales del tenant: marca, zona horaria, zonas de servicio, SMTP/email, mensajes y diseño.",
      ar:"إعدادات التانت العامة: البراند، المنطقة الزمنية، نطاقات الخدمة، SMTP والإيميل، الرسائل والتصميم.",
      fr:"Paramètres généraux du tenant : marque, fuseau horaire, zones de service, SMTP/email, messages et design.",
      it:"Impostazioni generali tenant: branding, fuso orario, zone servizio, SMTP/email, messaggi e design."
    },
    "smart-dispatch-engine.html":{
      "es-MX":"Configura estrategia Smart Dispatch, límites, requisitos del conductor, balance y puntuación.",
      ar:"يضبط استراتيجية Smart Dispatch والحدود وشروط السائق والتوزيع والأوزان.",
      fr:"Configure la stratégie Smart Dispatch, les limites, exigences chauffeur, équilibrage et scoring.",
      it:"Configura strategia Smart Dispatch, limiti, requisiti autista, bilanciamento e punteggio."
    },
    "shared-engine-settings.html":{
      "es-MX":"Configura reglas Shared, máximo de pasajeros, tolerancias de distancia/tiempo, prioridades y fuentes.",
      ar:"يضبط قواعد Shared وعدد الركاب وحدود المسافة والوقت والأولويات ومصادر الرحلات.",
      fr:"Configure les règles Shared, limite passagers, tolérances distance/temps, priorités et sources.",
      it:"Configura regole Shared, limite passeggeri, tolleranze distanza/tempo, priorità e origini."
    },
    "dispatch-add-trip.html":{
      "es-MX":"Crea viajes individuales/compartidos, guarda borradores y prepara viajes para revisión.",
      ar:"ينشئ رحلات فردية أو مشتركة ويحفظ المسودات ويجهز الرحلات للمراجعة.",
      fr:"Crée des trajets individuels/partagés, enregistre les brouillons et prépare les trajets pour révision.",
      it:"Crea corse individuali/condivise, salva bozze e prepara le corse per la revisione."
    },
    "reserved-add-stop.html":{
      "es-MX":"Modifica la ruta de un viaje Reserved agregando, editando o eliminando paradas o el drop-off.",
      ar:"يعدل مسار رحلة Reserved بإضافة أو تعديل أو حذف الاستوبات أو تغيير الدروب أوف.",
      fr:"Modifie l’itinéraire d’un trajet Reserved en ajoutant, modifiant ou supprimant des arrêts ou le drop-off.",
      it:"Modifica il percorso Reserved aggiungendo, modificando o eliminando stop o il drop-off."
    },
    "admin-chat.html":{
      "es-MX":"Comunicación con conductores, estado online, mensajes no leídos e historial de conversación.",
      ar:"للتواصل مع السائقين وعرض حالة الأونلاين والرسائل غير المقروءة وسجل المحادثة.",
      fr:"Communication avec les chauffeurs, statut en ligne, messages non lus et historique de conversation.",
      it:"Comunicazione con autisti, stato online, messaggi non letti e cronologia conversazione."
    }
  };

  const GLOSSARY = {
    "es-MX":{
      "Open ":"Abre ","Click ":"Haz clic en ","Choose ":"Elige ","Select ":"Selecciona ","Review ":"Revisa ",
      "Use ":"Usa ","Change ":"Cambia ","Save ":"Guarda ","Enter ":"Ingresa ","Complete ":"Completa ",
      "Locate ":"Busca ","Confirm ":"Confirma ","Set ":"Configura ","Update ":"Actualiza ","Apply ":"Aplica ","Verify ":"Verifica ",
      "Trip":"Viaje","Trips":"Viajes","Driver":"Conductor","Drivers":"Conductores","Vehicle":"Vehículo","Vehicles":"Vehículos",
      "Service":"Servicio","Services":"Servicios","Pricing":"Precios","Status":"Estado","Search":"Buscar","Filter":"Filtrar",
      "Edit":"Editar","Delete":"Eliminar","Remove":"Quitar","Add":"Agregar","Shared":"Compartido","Individual":"Individual",
      "Pickup":"Recogida","Dropoff":"Destino","Drop-off":"Destino","Time":"Hora","Date":"Fecha","Settings":"Ajustes",
      "Broker":"Broker","Company":"Compañía","User":"Usuario","Users":"Usuarios","Schedule":"Horario","Message":"Mensaje",
      "Messages":"Mensajes","Payment":"Pago","Payments":"Pagos","Invoice":"Factura","Report":"Reporte","Summary":"Resumen",
      "Final Confirmation":"Confirmación final","Dispatch Review":"Revisión de Dispatch","Dispatch":"Dispatch"
    },
    ar:{
      "Open ":"افتح ","Click ":"اضغط على ","Choose ":"اختر ","Select ":"حدد ","Review ":"راجع ",
      "Use ":"استخدم ","Change ":"غيّر ","Save ":"احفظ ","Enter ":"أدخل ","Complete ":"أكمل ",
      "Locate ":"ابحث عن ","Confirm ":"أكد ","Set ":"اضبط ","Update ":"حدّث ","Apply ":"طبّق ","Verify ":"تأكد من ",
      "Trip":"رحلة","Trips":"رحلات","Driver":"سائق","Drivers":"سائقين","Vehicle":"سيارة","Vehicles":"سيارات",
      "Service":"خدمة","Services":"خدمات","Pricing":"الأسعار","Status":"الحالة","Search":"البحث","Filter":"الفلترة",
      "Edit":"تعديل","Delete":"حذف","Remove":"إزالة","Add":"إضافة","Shared":"مشتركة","Individual":"فردية",
      "Pickup":"البيك أب","Dropoff":"الدروب أوف","Drop-off":"الدروب أوف","Time":"الوقت","Date":"التاريخ","Settings":"الإعدادات",
      "Broker":"البروكر","Company":"الشركة","User":"المستخدم","Users":"المستخدمين","Schedule":"الجدول","Message":"رسالة",
      "Messages":"رسائل","Payment":"الدفع","Payments":"المدفوعات","Invoice":"فاتورة","Report":"تقرير","Summary":"الملخص",
      "Final Confirmation":"التأكيد النهائي","Dispatch Review":"مراجعة الديسباتش","Dispatch":"الديسباتش"
    },
    fr:{
      "Open ":"Ouvrez ","Click ":"Cliquez sur ","Choose ":"Choisissez ","Select ":"Sélectionnez ","Review ":"Vérifiez ",
      "Use ":"Utilisez ","Change ":"Modifiez ","Save ":"Enregistrez ","Enter ":"Saisissez ","Complete ":"Complétez ",
      "Locate ":"Recherchez ","Confirm ":"Confirmez ","Set ":"Configurez ","Update ":"Mettez à jour ","Apply ":"Appliquez ","Verify ":"Vérifiez ",
      "Trip":"Trajet","Trips":"Trajets","Driver":"Chauffeur","Drivers":"Chauffeurs","Vehicle":"Véhicule","Vehicles":"Véhicules",
      "Service":"Service","Services":"Services","Pricing":"Tarification","Status":"Statut","Search":"Recherche","Filter":"Filtre",
      "Edit":"Modifier","Delete":"Supprimer","Remove":"Retirer","Add":"Ajouter","Shared":"Partagé","Individual":"Individuel",
      "Pickup":"Prise en charge","Dropoff":"Destination","Drop-off":"Destination","Time":"Heure","Date":"Date","Settings":"Paramètres",
      "Broker":"Broker","Company":"Société","User":"Utilisateur","Users":"Utilisateurs","Schedule":"Planning","Message":"Message",
      "Messages":"Messages","Payment":"Paiement","Payments":"Paiements","Invoice":"Facture","Report":"Rapport","Summary":"Résumé",
      "Final Confirmation":"Confirmation finale","Dispatch Review":"Revue Dispatch","Dispatch":"Dispatch"
    },
    it:{
      "Open ":"Apri ","Click ":"Fai clic su ","Choose ":"Scegli ","Select ":"Seleziona ","Review ":"Controlla ",
      "Use ":"Usa ","Change ":"Modifica ","Save ":"Salva ","Enter ":"Inserisci ","Complete ":"Completa ",
      "Locate ":"Trova ","Confirm ":"Conferma ","Set ":"Imposta ","Update ":"Aggiorna ","Apply ":"Applica ","Verify ":"Verifica ",
      "Trip":"Corsa","Trips":"Corse","Driver":"Autista","Drivers":"Autisti","Vehicle":"Veicolo","Vehicles":"Veicoli",
      "Service":"Servizio","Services":"Servizi","Pricing":"Prezzi","Status":"Stato","Search":"Cerca","Filter":"Filtro",
      "Edit":"Modifica","Delete":"Elimina","Remove":"Rimuovi","Add":"Aggiungi","Shared":"Condivisa","Individual":"Individuale",
      "Pickup":"Pickup","Dropoff":"Destinazione","Drop-off":"Destinazione","Time":"Orario","Date":"Data","Settings":"Impostazioni",
      "Broker":"Broker","Company":"Azienda","User":"Utente","Users":"Utenti","Schedule":"Programma","Message":"Messaggio",
      "Messages":"Messaggi","Payment":"Pagamento","Payments":"Pagamenti","Invoice":"Fattura","Report":"Report","Summary":"Riepilogo",
      "Final Confirmation":"Conferma finale","Dispatch Review":"Revisione Dispatch","Dispatch":"Dispatch"
    }
  };

  function repeatedEditExplanation(){
    const map = {"en": "These results use similar edit actions, but each page has a different job: Trips Hub edits any trip including future trips; Trips is the faster Today/Tomorrow operational edit; Dispatch changes driver/vehicle assignment only.", "es-MX": "Estos resultados usan acciones de edición parecidas, pero cada página tiene una función distinta: Trips Hub edita cualquier viaje, incluso futuros; Trips es la edición operativa rápida de Hoy/Mañana; Dispatch cambia solamente la asignación de conductor/vehículo.", "ar": "النتائج دي فيها تعديل في أكتر من صفحة، لكن وظيفة كل صفحة مختلفة: Trips Hub لتعديل أي رحلة حتى الرحلات المستقبلية، وTrips للتعديل التشغيلي السريع لرحلات اليوم وغدًا، وDispatch لتغيير تعيين السائق أو السيارة فقط.", "fr": "Ces résultats utilisent des actions de modification similaires, mais chaque page a un rôle différent : Trips Hub modifie n’importe quel trajet, y compris futur ; Trips est la modification opérationnelle rapide Aujourd’hui/Demain ; Dispatch modifie uniquement l’affectation chauffeur/véhicule.", "it": "Questi risultati usano azioni di modifica simili, ma ogni pagina ha un compito diverso: Trips Hub modifica qualsiasi corsa, anche futura; Trips è la modifica operativa rapida Oggi/Domani; Dispatch modifica solo l’assegnazione autista/veicolo."};
    return map[state.lang] || map.en;
  }

  function clean(v){ return String(v ?? "").trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function t(key){ return UI[state.lang]?.[key] || UI.en[key] || key; }

  function translateText(text){
    if(state.lang === "en") return text;
    let out = String(text ?? "");
    const map = GLOSSARY[state.lang] || {};
    Object.keys(map)
      .sort((a,b)=>b.length-a.length)
      .forEach(key=>{
        out = out.split(key).join(map[key]);
      });
    return out;
  }

  function pageDescription(page){
    if(state.lang === "en") return page.description || "";
    return PAGE_DESC[page.pageFile]?.[state.lang] || translateText(page.description || "");
  }

  function staffValue(sessionKey,legacyKey){
    return sessionStorage.getItem(sessionKey) || localStorage.getItem(legacyKey) || "";
  }

  function currentRole(){
    const raw = upper(staffValue("staffRole","role"));
    if(raw === "SUPER_ADMIN" || raw === "SUPERADMIN") return "SUPER_ADMIN";
    if(raw === "DISPATCHER") return "DISPATCHER";
    return "ADMIN";
  }

  function authHeaders(){
    const token = staffValue("staffToken","token");
    return token ? {Authorization:"Bearer " + token} : {};
  }

  async function loadCapabilities(){
    try{
      const r = await fetch("/api/shared-engine/settings",{cache:"no-store",headers:authHeaders()});
      if(!r.ok) return;
      const data = await r.json().catch(()=>({}));
      const cap = data?.capabilities || {};
      state.sharedEnabled = cap.sharedServiceEnabled === true || cap.sharedServiceFound === true;
      state.brokerEnabled = cap.brokerContractEnabled === true;
    }catch(err){
      console.log("HELP CAPABILITY LOAD ERROR:",err?.message || err);
    }
  }

  function featureAllowed(feature){
    const key = upper(feature);
    if(!key) return true;
    if(key === "BROKER") return state.brokerEnabled;
    if(key === "SHARED") return state.sharedEnabled;
    return true;
  }

  function roleAllowed(article){
    if(state.role === "SUPER_ADMIN") return true;
    const roles = Array.isArray(article?.roles) ? article.roles.map(upper) : [];
    return roles.includes(state.role);
  }

  async function loadKnowledge(){
    const indexRes = await fetch("/admin/help-data/help-index.json",{cache:"no-store"});
    if(!indexRes.ok) throw new Error("Help index could not be loaded.");
    state.index = await indexRes.json();

    const pages = Array.isArray(state.index?.pages) ? state.index.pages : [];
    const docs = await Promise.all(pages.map(async page=>{
      const res = await fetch("/admin/" + page.dataFile,{cache:"no-store"});
      if(!res.ok) return null;
      return await res.json().catch(()=>null);
    }));

    state.articles = docs.filter(Boolean).flatMap(doc=>Array.isArray(doc.articles) ? doc.articles : []);
  }

  function accessibleArticles(){
    return state.articles.filter(a=>
      a?.active !== false &&
      roleAllowed(a) &&
      featureAllowed(a?.requiredFeature)
    );
  }

  function accessiblePages(){
    const allowed = new Set(accessibleArticles().map(a=>a.pageFile));
    return (state.index?.pages || [])
      .filter(p=>allowed.has(p.pageFile))
      .sort((a,b)=>(a.headerOrder ?? 999) - (b.headerOrder ?? 999));
  }

  function normalizeSearch(value){
    return clean(value).toLowerCase().replace(/[_-]/g," ").replace(/\s+/g," ");
  }

  function articleText(article){
    return normalizeSearch([
      article?.title, article?.summary, article?.pageTitle, article?.pageFile,
      ...(article?.keywords || []), ...(article?.steps || []), ...(article?.warnings || [])
    ].join(" "));
  }

  function searchScore(article,query){
    const q = normalizeSearch(query);
    if(!q) return 1;

    const words = q.split(" ").filter(Boolean);
    const title = normalizeSearch(article.title || "");
    const translatedTitle = normalizeSearch(translateText(article.title || ""));
    const keywords = normalizeSearch((article.keywords || []).join(" "));
    const translatedSteps = normalizeSearch((article.steps || []).map(translateText).join(" "));
    const hay = normalizeSearch(articleText(article) + " " + translatedTitle + " " + translatedSteps);

    let score = 0;

    if(title === q || translatedTitle === q) score += 150;
    if(title.includes(q) || translatedTitle.includes(q)) score += 90;
    if(keywords.includes(q)) score += 70;
    if(hay.includes(q)) score += 45;

    let matchedWords = 0;

    for(const word of words){
      if(title.includes(word) || translatedTitle.includes(word)) score += 25;
      if(keywords.includes(word)) score += 18;
      if(hay.includes(word)){
        score += 8;
        matchedWords += 1;
      }
    }

    if(words.length > 1 && matchedWords === words.length){
      score += 40;
    }

    return score;
  }

  function visibleResults(){
    const query = $("helpSearch")?.value || "";
    return accessibleArticles()
      .filter(a=>!state.page || a.pageFile === state.page)
      .map(article=>({article,score:searchScore(article,query)}))
      .filter(x=>!normalizeSearch(query) || x.score > 0)
      .sort((a,b)=>b.score-a.score || a.article.pageId.localeCompare(b.article.pageId) || a.article.id.localeCompare(b.article.id))
      .slice(0,100)
      .map(x=>x.article);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function setLanguage(lang){
    state.lang = UI[lang] ? lang : "en";
    localStorage.setItem("ghHelpLanguage",state.lang);
    document.documentElement.lang = state.lang === "es-MX" ? "es-MX" : state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";

    $("uiTitle").textContent = t("title");
    $("uiSubtitle").textContent = t("subtitle");
    $("uiLanguageLabel").textContent = t("language");
    $("clearPageFilter").textContent = t("showAll");
    $("helpSearch").placeholder = t("search");

    renderPageFilter();
    renderSelectedPage();
    renderResults();
  }

  function choosePage(file){
    state.page = file || "";
    if($("helpPageFilter")){
      $("helpPageFilter").value = state.page;
    }
    renderSelectedPage();
    renderResults();
  }

  function renderSelectedPage(){
    const card = $("selectedPageCard");
    if(!card) return;

    const page = accessiblePages().find(p=>p.pageFile === state.page);

    if(!page){
      card.hidden = true;
      $("selectedPageId").textContent = "";
      $("selectedPageTitle").textContent = "";
      $("selectedPageDescription").textContent = "";
      return;
    }

    card.hidden = false;
    $("selectedPageId").textContent = page.pageId;
    $("selectedPageTitle").textContent = translateText(page.pageTitle);
    $("selectedPageDescription").textContent = pageDescription(page);
  }

  function renderPageFilter(){
    const select = $("helpPageFilter");
    if(!select) return;

    const pages = accessiblePages();
    const standardPages = pages.filter(p=>p.helpGroup !== "BROKER");
    const brokerPages = pages.filter(p=>p.helpGroup === "BROKER");

    select.innerHTML = "";

    const all = document.createElement("option");
    all.value = "";
    all.textContent = t("allPages");
    select.appendChild(all);

    if(standardPages.length){
      const group = document.createElement("optgroup");
      group.label = t("standardPages");
      standardPages.forEach(page=>{
        const option = document.createElement("option");
        option.value = page.pageFile;
        option.textContent = `${page.pageId} — ${translateText(page.pageTitle)}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    }

    if(brokerPages.length){
      const group = document.createElement("optgroup");
      group.label = t("brokerPages");
      brokerPages.forEach(page=>{
        const option = document.createElement("option");
        option.value = page.pageFile;
        option.textContent = `${page.pageId} — ${translateText(page.pageTitle)}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    }

    select.value = state.page;
  }

  function renderResults(){
    const host = $("helpResults");
    const countEl = $("helpResultCount");
    if(!host || !countEl) return;

    const results = visibleResults();
    const query = clean($("helpSearch")?.value);
    const selectedPage = accessiblePages().find(p=>p.pageFile === state.page);

    if(!query && !selectedPage){
      countEl.textContent = "";
      host.innerHTML = `<div class="help-empty">${escapeHtml(t("startHelp"))}</div>`;
      return;
    }

    countEl.textContent =
      `${results.length} ${results.length === 1 ? t("result") : t("results")}` +
      (selectedPage ? ` ${t("in")} ${selectedPage.pageId} — ${translateText(selectedPage.pageTitle)}` : "") +
      (query ? ` ${t("for")} "${query}"` : "");

    if(!results.length){
      host.innerHTML = `<div class="help-empty">${escapeHtml(t("noResults"))}</div>`;
      return;
    }

    const normalizedQuery = normalizeSearch(query);
    const repeatedEditSearch =
      /\b(edit|change|modify|update|assign|driver|تعديل|غيّر|غير|editar|cambiar|modifier|modifica|cambia)\b/i
        .test(normalizedQuery);

    const pagesInResults =
      new Set(results.map(article=>article.pageFile));

    const scopeExplanation =
      repeatedEditSearch && pagesInResults.size > 1
        ? `<div class="scope-explanation">${escapeHtml(repeatedEditExplanation())}</div>`
        : "";

    host.innerHTML = scopeExplanation + results.map(article=>{
      const warning = Array.isArray(article.warnings) && article.warnings.length
        ? `<div class="help-warning">${article.warnings.map(w=>`<div>${escapeHtml(translateText(w))}</div>`).join("")}</div>`
        : "";

      return `
        <article class="help-result">
          <button class="help-result-head" type="button">
            <div>
              <div class="help-result-title">${escapeHtml(translateText(article.title))}</div>
              <div class="help-result-meta">
                ${escapeHtml(article.pageId)} · ${escapeHtml(translateText(article.pageTitle))}
              </div>
              <div class="help-result-summary">${escapeHtml(translateText(article.summary))}</div>
            </div>
            <span class="help-chevron">⌄</span>
          </button>

          <div class="help-result-body">
            <ol class="help-steps">
              ${(article.steps || []).map(step=>`<li>${escapeHtml(translateText(step))}</li>`).join("")}
            </ol>
            ${warning}
            <div class="help-source">${escapeHtml(t("page"))}: ${escapeHtml(article.pageFile)}</div>
          </div>
        </article>
      `;
    }).join("");

    host.querySelectorAll(".help-result-head").forEach(btn=>{
      btn.addEventListener("click",()=>btn.closest(".help-result")?.classList.toggle("open"));
    });
  }

  function bind(){
    $("helpSearch")?.addEventListener("input",renderResults);
    $("helpPageFilter")?.addEventListener("change",e=>choosePage(e.target.value || ""));
    $("clearPageFilter")?.addEventListener("click",()=>choosePage(""));
    $("helpLanguage")?.addEventListener("change",e=>setLanguage(e.target.value));
  }

  async function init(){
    try{
      state.role = currentRole();
      await Promise.all([loadCapabilities(),loadKnowledge()]);
      bind();
      if($("helpLanguage")) $("helpLanguage").value = state.lang;
      setLanguage(state.lang);
    }catch(err){
      console.log("HELP CENTER ERROR:",err);
      if($("helpResultCount")) $("helpResultCount").textContent = "Help Center failed to load.";
      if($("helpResults")) $("helpResults").innerHTML = `<div class="help-empty">${escapeHtml(err.message || "Unable to load Help Center.")}</div>`;
    }
  }

  return {init};

})();

HelpCenter.init();
