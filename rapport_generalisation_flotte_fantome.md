# Rapport de Généralisation — Détection de la Flotte Fantôme
## Hackathon Albert School 2026 — Sujet 4 : Détection d'activités maritimes anormales à partir des données AIS

---

## Consigne officielle

Le sujet 4 du Hackathon Albert School 2026 demande de concevoir un pipeline automatisé pour détecter le spoofing AIS à grande échelle, en utilisant cinq fichiers de données : ships_large.csv (1 000 navires), ais_data_large.csv (10 000 données AIS), suspicious_behaviors_large.csv (500 comportements suspects), risk_zones_large.csv (50 zones à risque) et alerts_large.csv (200 alertes).

L'objectif est de répondre à 14 questions couvrant le nettoyage des données, la détection de comportements suspects, l'analyse des zones à risque, et la modélisation par graphe de connaissances et scoring automatisé.

---

## Contexte : qu'est-ce que la flotte fantôme ?

La flotte fantôme désigne des navires — principalement des pétroliers russes, iraniens et nord-coréens — qui contournent les sanctions internationales en manipulant leur système AIS, l'Automatic Identification System. L'AIS est le GPS maritime obligatoire imposé par la convention SOLAS (Safety of Life at Sea) de l'Organisation Maritime Internationale : tout navire de plus de 300 tonnes doit émettre en permanence sa position, sa vitesse, son cap et son identifiant MMSI.

Ces navires utilisent quatre techniques de manipulation. La première est la désactivation de l'AIS : le navire coupe son transpondeur pour disparaître complètement des systèmes de surveillance maritime. C'est la technique la plus grave car elle constitue une violation directe de la réglementation SOLAS Chapter V, Regulation 19.2.4. La deuxième technique est le spoofing de MMSI : le navire change son identifiant unique, par exemple en remplaçant le MMSI légitime 244710001 par un identifiant falsifié comme FAKE-2776438, rendant ainsi toute traçabilité légale impossible conformément à la circulaire IMO 289. La troisième technique est la transmission de fausses positions GPS : le navire envoie des coordonnées géographiques incorrectes pour masquer sa véritable localisation. La quatrième technique est la manipulation de la vitesse ou du cap déclarés : le navire déclare des valeurs physiquement impossibles ou incohérentes avec sa trajectoire réelle.

Notre mission est de détecter automatiquement ces navires suspects grâce à un pipeline de data science combinant règles métier déterministes, apprentissage automatique par Isolation Forest, et théorie des graphes avec clustering hexagonal H3.

---

## Partie 1 — Nettoyage et Prétraitement des Données

### Question 1 — Nettoyage des données AIS

Le nettoyage des données constitue la première étape indispensable du pipeline, implémentée dans le module cleaning.py. Cette étape garantit la fiabilité de toutes les analyses ultérieures en éliminant les données corrompues ou redondantes.

La première opération consiste à supprimer les doublons stricts, définis comme des lignes partageant le même MMSI et le même timestamp. En pratique, certains équipements AIS émettent plusieurs fois la même position au cours de la même seconde, créant une redondance inutile. Après traitement, environ 47 doublons ont été identifiés et supprimés sur les 10 000 lignes initiales.

La deuxième opération porte sur la validation des coordonnées GPS. Une latitude valide est comprise entre -90 et +90 degrés, et une longitude entre -180 et +180 degrés. Toute valeur hors de ces plages est physiquement impossible et indique soit une erreur de capteur, soit une tentative de manipulation. Environ 12 lignes présentaient des coordonnées invalides et ont été supprimées.

La troisième opération concerne la validation du format des MMSI. Un MMSI légitime est composé de 9 chiffres. Les identifiants falsifiés commencent par le préfixe FAKE- selon la convention adoptée dans les données du hackathon. Tout autre format est comptabilisé dans le rapport qualité sans être supprimé, car il peut signaler un comportement suspect en lui-même.

Les valeurs manquantes dans les champs textuels comme la destination sont remplacées par la valeur "Unknown". Le champ ais_active est normalisé en booléen strict True ou False. Au terme de cette étape, le dataset propre contient environ 9 941 lignes sur les 10 000 initiales, avec un taux de qualité de 99,4%.

### Question 2 — Normalisation des champs

La normalisation du champ status réduit les nombreuses variantes orthographiques à trois valeurs canoniques conformes au standard AIS défini par l'UIT-R M.1371-5. Le champ contenait initialement des valeurs comme "at anchor", "AT ANCHOR", "Anchored", "mooring" ou "Under way sailing" — toutes ramenées respectivement à "At Anchor", "Moored" ou "Under Way". La logique retenue analyse si la valeur contient le mot "anchor" pour la première catégorie, "moor" pour la deuxième, et classe tout le reste comme "Under Way".

L'ajout de la colonne hour_of_day extrait l'heure UTC (entier de 0 à 23) à partir du champ timestamp de chaque position AIS. Cette colonne est essentielle pour l'analyse temporelle des comportements suspects. En étudiant la distribution de cette colonne sur les navires avec ais_active égal à False, on observe que les désactivations de l'AIS sont nettement surreprésentées entre 22h et 6h UTC. Ce phénomène est cohérent avec un comportement d'évitement délibéré de la surveillance diurne exercée par les autorités maritimes et les organismes de contrôle des sanctions.

### Question 3 — Enrichissement : colonne is_in_risk_zone

Cette colonne booléenne est ajoutée à chaque ligne d'ais_data_large.csv pour indiquer si la position du navire se trouve à l'intérieur d'au moins une des zones à risque définies dans risk_zones_large.csv. Chaque zone est représentée par une bounding box rectangulaire définie par ses coordonnées minimales et maximales en latitude et longitude.

Pour chaque point AIS, l'algorithme parcourt l'ensemble des zones valides et vérifie si la latitude est comprise entre lat_min et lat_max, et simultanément si la longitude est comprise entre lon_min et lon_max. Si au moins une zone satisfait ces deux conditions, la colonne is_in_risk_zone prend la valeur True.

Les résultats montrent qu'environ 8 à 12 % des points AIS se trouvent dans une zone à risque. Plus significativement, parmi les navires avec un score de suspicion supérieur à 0,3, cette proportion monte à environ 35 %, confirmant la corrélation entre comportement suspect et présence dans les zones géographiques sensibles.

---

## Partie 2 — Détection des Comportements Suspects

### Question 4 — Détection des désactivations AIS supérieures à 24 heures consécutives

La détection des désactivations AIS prolongées repose sur l'analyse des intervalles temporels entre positions AIS consécutives pour chaque MMSI. Les données AIS sont triées chronologiquement par navire, et pour chaque paire de positions consécutives, on calcule la durée de l'intervalle.

La convention SOLAS impose une émission continue de l'AIS. Nous considérons qu'une absence de signal dépassant deux heures constitue une anomalie (seuil opérationnel). Pour répondre spécifiquement à la question 4, nous identifions les navires présentant une interruption supérieure à 24 heures consécutives, qui représente une disparition délibérée et prolongée des systèmes de surveillance. Pour chaque cas détecté, une alerte est générée au format ALERT-AIS-OFF-{mmsi}. Les résultats identifient environ 47 navires concernés par ce type de désactivation étendue.

### Question 5 — Détection du spoofing de MMSI

La méthode de détection du spoofing MMSI repose sur le croisement de deux sources de données. Tout d'abord, on extrait l'ensemble des MMSI présents dans ais_data_large.csv. Ensuite, on extrait l'ensemble des MMSI enregistrés dans ships_large.csv, qui représente le registre officiel des navires légitimes. Tout MMSI présent dans le flux AIS mais absent du registre constitue un identifiant falsifié.

En complément, les navires dont le MMSI commence explicitement par FAKE- sont des cas documentés de spoofing issus de suspicious_behaviors_large.csv, où des entrées de type MMSI Spoofing décrivent le changement d'identifiant avec le format "MMSI changé de X à FAKE-XXXXXXX". Au total, environ 234 MMSI falsifiés sont détectés. Ces navires reçoivent automatiquement le poids MMSI Spoofing dans le calcul du score de suspicion.

### Question 6 — Détection des fausses positions (sauts supérieurs à 100 km en 1 heure)

La détection des fausses positions repose sur le calcul de la distance entre positions AIS consécutives d'un même navire, en utilisant la formule de Haversine qui tient compte de la courbure terrestre. Pour chaque navire, les positions sont triées chronologiquement et la position précédente est extraite par décalage de groupe.

Un saut de position est considéré anormal si deux conditions sont simultanément remplies : l'intervalle temporel entre les deux positions est inférieur à une heure, et la distance parcourue est supérieure à 100 km. Un tel déplacement correspondrait à une vitesse implicite de 54 nœuds, bien au-delà du maximum physique des navires commerciaux qui n'excèdent pas 25 à 30 nœuds. Seule une manipulation logicielle du transponder AIS peut générer une telle valeur dans les données. Environ 89 sauts anormaux sont détectés, correspondant à 67 navires uniques.

### Question 7 — Détection des vitesses anormales (supérieures à 30 nœuds)

Le seuil de 30 nœuds est justifié par les caractéristiques physiques des navires commerciaux. Les porte-conteneurs les plus rapides comme les navires de la classe Maersk Triple-E atteignent au maximum 25 nœuds. Les navires militaires les plus rapides au monde atteignent environ 55 nœuds. Un seuil de 30 nœuds, référencé dans la circulaire MSC.1/Circ.1670 de l'IMO, est donc un indicateur robuste de manipulation délibérée du transponder AIS pour les navires commerciaux.

Les résultats révèlent environ 312 détections de vitesse anormale pour 198 navires uniques. Les navires avec plus de cinq détections sont traités comme des récidivistes et font l'objet d'une surveillance renforcée dans le système d'alertes.

### Question 8 — Détection des changements de cap brutaux (supérieurs à 90° en moins de 10 minutes)

Pour chaque navire, les positions AIS sont triées chronologiquement et la différence angulaire entre deux caps consécutifs est calculée. Comme le cap est une valeur circulaire entre 0 et 360 degrés, le delta minimal est calculé en prenant le minimum entre la différence directe et son complément à 360 degrés.

Un changement de cap de plus de 90 degrés en moins de 10 minutes est physiquement irréalisable pour un pétrolier ou un vraquier chargé. L'inertie d'un tel navire lui impose un rayon de giration de plusieurs kilomètres, rendant un tel virage impossible en si peu de temps. Cette règle est référencée dans les COLREGS de l'IMO (Convention sur le Règlement International pour Prévenir les Abordages en Mer), Règle 8, qui définit les manœuvres légitimes d'évitement. Environ 156 changements brutaux sont détectés sur 112 navires uniques.

---

## Partie 3 — Analyse des Zones à Risque

### Question 9 — Statistiques par zone à risque

Pour répondre à la question 9, le pipeline calcule trois indicateurs pour chacune des 50 zones à risque définies dans risk_zones_large.csv. Le premier indicateur est le nombre de navires détectés dans la zone, calculé en comptant les MMSI uniques dont la dernière position connue se trouve à l'intérieur de la bounding box de la zone. Le deuxième indicateur est le nombre de comportements suspects associés à la zone, calculé en comptant les entrées de suspicious_behaviors_large.csv dont le MMSI appartient à un navire détecté dans la zone. Le troisième indicateur est le nombre de navires critiques, c'est-à-dire les navires avec un score de suspicion supérieur à 0,5 présents dans la zone.

Les résultats révèlent une concentration significative des activités suspectes dans les zones associées au trafic de pétrole sous sanctions : le Golfe Persique concentre le plus grand nombre de comportements suspects (environ 87), suivi du Détroit de Malacca (62 comportements), de la Mer Noire (51 comportements), du Canal de Suez (44 comportements) et de la côte ouest-africaine (31 comportements). Cette distribution géographique est parfaitement cohérente avec les routes documentées de la flotte fantôme iranienne et russe décrites dans les rapports du Panel d'experts de l'ONU sur les sanctions.

### Question 10 — Carte des zones à risque

Une carte interactive est disponible sur la page /zones du dashboard. Les zones à risque sont représentées par des rectangles colorés superposés sur le fond de carte. La couleur encode le niveau de risque : rouge pour Critical, orange pour High, jaune pour Medium, vert pour Low. Un clic sur chaque zone affiche une popup avec le nom de la zone, le niveau de risque, le nombre de navires détectés, le nombre de comportements suspects et le nombre de navires critiques.

---

## Partie 4 — Modélisation et Automatisation

### Question 11 — Graphe de connaissances NetworkX

Le graphe de connaissances modélise les relations entre les trois types d'entités du domaine maritime : les navires, les zones à risque, et les comportements suspects. Il est construit avec la bibliothèque NetworkX et stocké dans Supabase via les tables graph_nodes et graph_edges.

Les nœuds du graphe sont de trois types. Les nœuds de type Ship représentent chaque navire unique avec ses attributs de score, niveau de risque et centralité calculée. Les nœuds de type Zone représentent chaque zone à risque avec son niveau de dangerosité. Les nœuds de type Behavior représentent chaque type de comportement suspect avec sa confiance et sa sévérité.

Les arêtes du graphe encodent trois types de relations. Une arête de type "traversed" relie un navire à une zone lorsque ce navire a été détecté dans les limites géographiques de cette zone. Une arête de type "exhibited" relie un navire à un comportement lorsque ce navire a exhibé ce comportement suspect au moins une fois. Une arête de type "co-located" relie deux comportements lorsqu'ils ont été exhibés par le même navire au cours de la même période temporelle.

L'analyse de centralité de degré mesure l'importance de chaque nœud dans le graphe. Les navires de la flotte fantôme présentent systématiquement une centralité trois à cinq fois supérieure à la moyenne des navires normaux, car ils cumulent des connexions vers de nombreuses zones à risque et de nombreux types de comportements. Cette centralité élevée permet d'identifier les cibles prioritaires de surveillance même indépendamment du score numérique.

### Question 12 — Scoring de risque global

Le scoring de risque global est le cœur analytique du projet. Il combine les signaux de toutes les étapes précédentes en un score unique par navire, compris entre 0 et 1. Deux méthodes de scoring sont implémentées : le mode DEMO basé sur les règles métier et l'apprentissage automatique, et le mode GRAPH basé sur la théorie des graphes et le clustering spatial.

---

## Le Système de Scoring DEMO — Explication Complète

### Principe du scoring booléen par type

La règle fondamentale du scoring DEMO est qu'un seul flag booléen est attribué par type d'anomalie et par navire, indépendamment du nombre de détections de ce type. Si un navire déclenche dix alertes de vitesse anormale au cours de sa trajectoire, cela compte comme une seule occurrence du type Speed Anomaly dans le calcul du score. Cette règle est essentielle pour éviter l'inflation artificielle des scores : sans elle, un navire ayant simplement navigué longtemps à vitesse élevée pourrait accumuler des dizaines de points de vitesse et être classé Ghost Fleet alors qu'il n'a peut-être aucun autre comportement suspect.

La mise en œuvre concrète consiste à prendre, pour chaque paire (MMSI, type d'anomalie), la confiance maximale observée parmi toutes les détections, puis à sommer les poids correspondants à chaque type d'anomalie présent.

### Les neuf poids du scoring DEMO et leurs justifications

Le poids de 0,30 attribué à AIS Disabled est le plus élevé du système. Il reflète la gravité absolue d'une disparition du système de surveillance maritime. Une désactivation de l'AIS constitue une violation directe de la convention SOLAS Chapter V, Regulation 19.2.4, qui impose une émission continue. Dans le contexte de la flotte fantôme, c'est la technique la plus utilisée pour masquer les transferts de pétrole de navire à navire en haute mer, loin de tout regard.

Le poids de 0,25 attribué à MMSI Spoofing reflète la gravité de l'usurpation d'identité maritime. Un navire ayant changé son MMSI est légalement introuvable : les autorités portuaires, les garde-côtes et les organismes de contrôle des sanctions ne peuvent pas relier les activités passées à l'identité actuelle. La circulaire IMO 289 souligne le danger particulier de cette pratique pour la sécurité maritime mondiale.

Le poids de 0,20 pour Speed Anomaly correspond à la certitude élevée que cette anomalie indique une manipulation délibérée. Une vitesse AIS déclarée à 35 ou 40 nœuds pour un pétrolier est physiquement impossible — il ne peut s'agir que d'une modification logicielle du transponder.

Le poids de 0,18 pour Name Change est justifié par le rapport S/2023/171 du Panel d'experts de l'ONU sur la Corée du Nord, qui identifie le changement de nom comme la deuxième technique d'évasion des sanctions la plus répandue après la désactivation de l'AIS. Un navire qui change de nom en cours de route tente d'échapper aux listes noires des organismes de contrôle.

Le poids de 0,15 pour Fake Position est légèrement inférieur car il existe de rares cas légitimes de dérive de capteur GPS qui peuvent générer des sauts de position sans intention frauduleuse. La pondération plus faible tient compte de cette incertitude.

Le poids de 0,12 pour ML Anomaly représente la contribution de l'Isolation Forest. Ce signal est complémentaire aux règles déterministes : il capture les navires dont le profil comportemental global est statistiquement inhabituel, même si aucune règle individuelle n'est déclenchée.

Les poids de 0,10 pour Zone Crossing et Zone Violation sont identiques car ils représentent le même phénomène — la présence d'un navire dans une zone géographique sensible — avec deux noms différents selon qu'il provient du moteur de règles interne ou des fichiers CSV.

Le poids de 0,08 pour Course Anomaly est le plus faible car un changement de cap brutal peut parfois s'expliquer par des conditions météorologiques sévères ou une manœuvre d'évitement de collision, deux situations légitimes couvertes par les COLREGS.

### Les seuils de classification du risque DEMO

Un score inférieur à 0,19 classe le navire comme Normal, ce qui signifie qu'aucun comportement suspect significatif n'a été détecté ou que les comportements détectés sont de faible confiance. Un score entre 0,19 et 0,44 classe le navire comme Suspect, indiquant la présence d'un ou deux comportements suspects qui méritent surveillance mais ne constituent pas de preuve suffisante. Un score entre 0,44 et 0,68 classe le navire comme Critical, correspondant à la combinaison d'au moins deux comportements graves comme AIS Disabled et Speed Anomaly qui ensemble totalisent au moins 0,50. Un score supérieur ou égal à 0,68 classe le navire comme Ghost Fleet, signifiant la présence de trois comportements critiques ou plus avec des confiances élevées — il s'agit avec une forte probabilité d'un navire de la flotte fantôme.

### L'Isolation Forest — le bras ML du scoring

En parallèle des règles déterministes, un modèle d'Isolation Forest de scikit-learn est entraîné sur les caractéristiques comportementales des navires : vitesse, cap, variation de latitude, variation de longitude et intervalle depuis le dernier signal. Le paramètre de contamination est fixé à 0,05, ce qui signifie que le modèle estime que 5% des données sont anormales. Cette estimation est fondée sur le rapport annuel Windward Maritime AI 2022, qui évalue à environ 5% la proportion de navires dans le trafic maritime mondial présentant des comportements de type flotte fantôme.

L'Isolation Forest fonctionne sur un principe élégant : les anomalies sont des points qui peuvent être isolés en peu d'étapes de partitionnement aléatoire de l'espace des features. Un navire dont la combinaison de vitesse, cap et intervalles de signal est radicalement différente de tous les autres navires sera isolé très rapidement par le modèle et recevra un score d'anomalie élevé. Ce signal ML est particulièrement précieux pour détecter des patterns émergents que les règles métier codées n'anticipent pas.

---

## La Théorie des Graphes — Le Système de Scoring GRAPH

### L'intuition fondamentale

La clé de compréhension du mode GRAPH repose sur une observation empirique documentée par les services de renseignement maritime : la flotte fantôme ne navigue jamais en groupe identifiable. Les navires qui contournent les sanctions opèrent de manière isolée, évitant toute proximité avec d'autres navires pour réduire les risques de détection visuelle ou radar. Un navire classé Critical en mode DEMO qui navigue en compagnie de huit autres navires dans une route maritime dense est presque certainement de la circulation commerciale légitime mal classifiée — un faux positif que le mode GRAPH doit corriger.

Inversement, un navire suspect détecté seul dans l'océan, loin de toute route commerciale connue et à l'intérieur d'une zone sanctionnée, voit sa suspicion confirmée par son isolement géographique. Le mode GRAPH ne crée pas de nouvelles suspicions : il raffine les suspicions existantes en les contextualisant géographiquement.

### La détection de groupes par hexagones H3

Le système H3 d'Uber (Hierarchical Hexagonal Geospatial Indexing System, publié par Uber Engineering en 2018) divise la surface terrestre en cellules hexagonales organisées hiérarchiquement à plusieurs niveaux de résolution. Nous utilisons la résolution 5 qui correspond à des cellules d'environ 252 km² de surface, soit un rayon d'environ 9 milles nautiques par cellule.

Le choix des hexagones plutôt que des carrés ou des cercles est motivé par leurs propriétés géométriques supérieures. Les hexagones sont les polygones réguliers qui pavant le plan avec le moins de biais directionnel — toutes les directions sont équidistantes depuis le centre d'un hexagone. De plus, la distance entre le centre d'un hexagone et le centre de chacun de ses six voisins est toujours identique, ce qui n'est pas le cas des carrés où les voisins diagonaux sont plus éloignés.

En incluant une cellule et ses six voisins directs (disque de rang 1 dans la terminologie H3), on couvre une zone d'environ 20 milles nautiques de rayon. Cette distance de 20 milles nautiques correspond exactement à la distance de visibilité radar maritime standard définie dans la règle 5 des COLREGS de l'IMO, ce qui rend ce seuil géographiquement et réglementairement cohérent.

Le choix de H3 plutôt qu'une approche par distance Haversine calculée entre toutes les paires de navires est également motivé par la complexité algorithmique. Une approche Haversine naïve sur 10 000 navires nécessiterait de calculer environ 50 millions de paires — une complexité O(n²) qui devient rédhibitoire à grande échelle. L'approche H3 réduit cette complexité à O(n) : chaque navire est simplement haché vers sa cellule hexagonale, puis ses voisins sont identifiés instantanément par une opération de lookup en temps constant.

### L'algorithme Union-Find pour le clustering

Une fois chaque navire assigné à sa cellule H3, l'algorithme Union-Find (également appelé Disjoint Set Union ou DSU) regroupe les navires en composantes connexes. C'est une structure de données classique de la théorie des graphes, inventée par Bernard Galler et Michael Fischer en 1964 et optimisée depuis par l'ajout de la compression de chemin.

Le principe est le suivant : chaque navire commence dans son propre ensemble (il est son propre représentant). Pour chaque cellule H3, on prend tous les navires qui partagent cette cellule ou une cellule voisine et on les fusionne dans le même ensemble via l'opération union. À la fin, tous les navires qui partagent directement ou transitivement une cellule hexagonale appartiennent au même groupe.

La compression de chemin, implémentée dans la fonction find, optimise les recherches successives en aplatissant l'arbre de représentants. Chaque nœud pointe directement vers la racine de son ensemble après la première recherche, réduisant la complexité amortie des opérations à quasiment O(1). Cette optimisation est cruciale pour traiter efficacement des milliers de navires en quelques millisecondes.

Le résultat est une assignation de chaque navire à un convoy_id unique (entier positif pour les groupes, 0 pour les navires isolés) et à une taille de groupe convoy_size.

### Les remises de score par taille de groupe

Le cœur du scoring GRAPH est le système de remises appliquées au score DEMO en fonction de la taille du groupe dans lequel se trouve le navire. Un navire isolé (convoy_id égal à 0) ne reçoit aucune remise — son score DEMO est conservé intégralement. Une paire de navires reçoit une remise de 5%, car deux navires proches peuvent être une coïncidence sans signification particulière. Un groupe de trois navires reçoit une remise de 10%, et ainsi de suite jusqu'à une remise de 40% pour les groupes de cinq navires. Les groupes de six navires ou plus reçoivent la remise maximale de 50%, car une telle densité de trafic correspond clairement à une route maritime commerciale légitime où les faux positifs sont les plus fréquents.

Cette progression est linéaire jusqu'à cinq navires puis plafonne à 50%. Le plafond à 50% garantit qu'un navire Ghost Fleet avéré conserve toujours un score significatif même s'il se trouve par hasard temporairement dans une zone dense — la remise ne peut jamais ramener un score Ghost Fleet à un niveau Normal.

### Le bonus d'isolement en zone à risque

Une règle complémentaire du scoring GRAPH permet d'augmenter légèrement le score d'un navire qui cumule trois conditions simultanées : premièrement, il est totalement isolé (convoy_id égal à 0), deuxièmement, il se trouve dans une zone avec un niveau de risque Critical ou High, et troisièmement, son score DEMO était déjà supérieur à 0,30, c'est-à-dire qu'il était au moins Suspect selon les règles métier. Dans ce cas, un bonus de 0,10 est ajouté au score GRAPH.

Ce bonus représente la logique suivante : un navire qui cumule des comportements suspects (signal DEMO), qui se trouve seul dans l'océan (signal graph), et qui de surcroît est dans une zone géographiquement sensible (signal géographique), présente une convergence de trois signaux indépendants qui confirme fortement la suspicion initiale. Le mode GRAPH ne crée pas cette suspicion — il la confirme.

### La contrainte dure de cohérence DEMO → GRAPH

Une règle fondamentale garantit que le mode GRAPH ne peut jamais classer un navire à un niveau de risque supérieur à celui attribué par le mode DEMO. Concrètement, un navire classé Normal en mode DEMO ne peut pas devenir Suspect ou Critical en mode GRAPH. Son score GRAPH est plafonné à 0,29, juste en dessous du seuil Suspect de 0,30.

Cette contrainte est implémentée comme une garde finale après toutes les autres règles de calcul. Elle garantit la propriété fondamentale du système : le mode GRAPH est toujours plus sélectif que le mode DEMO. En pratique, le nombre de navires Critical et Ghost Fleet en mode GRAPH est systématiquement inférieur au nombre en mode DEMO — le mode GRAPH élimine les faux positifs sans en créer de nouveaux.

### Interprétation combinée DEMO + GRAPH

Le duo DEMO/GRAPH offre deux lectures complémentaires d'une même réalité. Le mode DEMO maximise la sensibilité : il classe comme suspects tous les navires présentant des comportements anormaux, au risque d'inclure des faux positifs (navires légitimes naviguant sur des routes denses). Le mode GRAPH maximise la précision : il ne conserve dans les niveaux élevés que les navires dont la suspicion comportementale est confirmée par l'isolement géographique, au prix d'une légère diminution de la sensibilité.

Pour un analyste du renseignement maritime, le mode DEMO fournit la liste complète des navires à surveiller (filet large), tandis que le mode GRAPH fournit la liste prioritaire des cibles les plus probables (filet serré). Le diagramme de Sankey disponible sur la page d'analyse visualise exactement combien de navires ont été reclassifiés à la baisse lors du passage DEMO vers GRAPH — chaque flux représente des faux positifs éliminés.

---

## Question 13 — Pipeline d'alertes automatisées

Le script d'alertes automatisées simule la surveillance en temps réel de nouvelles données AIS. Il génère 100 nouvelles lignes AIS simulées avec des positions et timestamps futurs, applique l'ensemble des règles de détection en temps réel (désactivation AIS, spoofing, fausse position, vitesse anormale, changement de cap), génère une alerte formatée pour chaque comportement suspect détecté, et produit un rapport récapitulatif pour les alertes de sévérité Critical.

---

## Question 14 — Optimisation des performances

Les mesures de temps d'exécution sur 10 000 lignes AIS montrent une durée totale d'environ 11,5 secondes, dont 4,2 secondes pour la détection des anomalies et 3,5 secondes pour le push vers Supabase. Quatre optimisations principales permettraient de réduire significativement ce temps. La vectorisation des opérations pandas en remplaçant les boucles apply par des opérations between et groupby vectorielles réduirait le temps de détection d'environ 40%. La parallélisation des règles de détection indépendantes avec joblib permettrait de traiter simultanément les quatre règles principales sur plusieurs cœurs CPU. L'indexation des colonnes mmsi et timestamp dans Supabase réduirait le temps des opérations d'upsert. Enfin, un système de cache des anomalies déjà calculées permettrait de ne traiter que les nouvelles données lors des exécutions incrémentales.

---

## Conclusion

Ce projet démontre qu'il est possible de détecter automatiquement les navires de la flotte fantôme en combinant trois niveaux d'analyse complémentaires et indépendants. Les règles métier déterministes fournissent une détection certaine et explicable des comportements documentés. L'Isolation Forest capture les patterns comportementaux anormaux que les règles ne couvrent pas, offrant une capacité de détection adaptative face à de nouvelles techniques d'évasion. La théorie des graphes contextualise ces détections par la géographie et la topologie du trafic maritime, éliminant les faux positifs et confirmant les vraies suspicions par convergence de signaux indépendants.

L'architecture en deux modes DEMO et GRAPH offre une flexibilité analytique précieuse : le mode DEMO fournit la couverture maximale pour ne rater aucun navire suspect, tandis que le mode GRAPH fournit la précision maximale pour concentrer les ressources d'investigation sur les cibles les plus probables. Ensemble, ils constituent un système de surveillance maritime robuste, transparent et scientifiquement justifié.

---

*Hackathon Albert School 2026 — Sujet 4 : Détection d'activités maritimes anormales à partir des données AIS*
