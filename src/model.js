import restClient from './rest-client'
import typeCache from './type-cache'
import permCache from './permission-cache'
import utils from './utils'
import Vue from 'vue'

// TODO: inject or factor out
const DEFAULT_TOPIC_ICON = '\uf111'               // fa-circle
const DEFAULT_TOPIC_TYPE_ICON = '\uf10c'          // fa-circle-o
const DEFAULT_ASSOC_COLOR = 'hsl(0, 0%, 80%)'     // matches dm5-color-picker gray

class DMXObject {

  constructor (object) {
    if (!object) {
      throw Error(`invalid object passed to DMXObject constructor: ${object}`)
    } else if (object.constructor.name !== 'Object') {
      throw Error(`DMXObject constructor expects plain Object, got ${object.constructor.name} (${object})`)
    }
    this.id      = object.id
    this.uri     = object.uri
    this.typeUri = object.typeUri
    this.value   = object.value
    this.childs  = utils.instantiateChilds(object.childs)
  }

  get typeName () {
    return this.getType().value
  }

  getCreationTime () {
    return restClient.getCreationTime(this.id)
  }

  getModificationTime () {
    return restClient.getModificationTime(this.id)
  }

  getCreator () {
    return restClient.getCreator(this.id)
  }

  getModifier () {
    return restClient.getModifier(this.id)
  }

  getWorkspace () {
    return restClient.getAssignedWorkspace(this.id)
  }

  getTopicmapTopics () {
    return restClient.getTopicmapTopics(this.id)
  }

  /**
   * Operates in-place
   *
   * @return    this object
   */
  fillChilds () {
    this.getType().assocDefs.forEach(assocDef => {
      let childs = this.childs[assocDef.assocDefUri]
      let child
      if (!childs) {
        // Note: child instantiation is done by the Topic constructor (recursively)
        child = new Topic(assocDef.getChildType().emptyInstance())
      }
      if (assocDef.isOne()) {
        if (childs) {
          childs.fillChilds()
        } else {
          childs = child
        }
        childs.fillRelatingAssoc(assocDef)
      } else {
        if (childs) {
          childs.forEach(child => {
            child.fillChilds()
          })
        } else {
          childs = [child]
        }
        childs.forEach(child => {
          child.fillRelatingAssoc(assocDef)
        })
      }
      if (child) {
        // Note: this object might be on display. Setting the childs must be reactive.
        Vue.set(this.childs, assocDef.assocDefUri, childs)
      }
    })
    return this
  }

  clone () {
    return utils.clone(this)
  }
}

class Topic extends DMXObject {

  constructor (topic) {
    super(topic)
    // relating assoc
    if (topic.assoc) {
      this.assoc = new Assoc(topic.assoc)
    }
  }

  // ---

  // TODO: make it a "type" getter?
  getType () {
    return typeCache.getTopicType(this.typeUri)
  }

  get icon () {
    return this.getType()._getIcon() || DEFAULT_TOPIC_ICON
  }

  isType () {
    // TODO: meta type?
    return this.typeUri === 'dmx.core.topic_type' ||
           this.typeUri === 'dmx.core.assoc_type'
  }

  isAssocDef () {
    return false    // topics are never assoc defs
  }

  /**
   * @param   filter
   *            Optional: 1-hop traversal filtering. An object with 4 properties (each one is optional):
   *              "assocTypeUri"
   *              "myRoleTypeUri"
   *              "othersRoleTypeUri"
   *              "othersTopicTypeUri"
   *            If not specified no filter is applied.
   */
  getRelatedTopics (filter) {
    return restClient.getTopicRelatedTopics(this.id, filter)
  }

  update () {
    console.log('update', this)
    return restClient.updateTopic(this)
  }

  /**
   * @return  a promise for a true/false value
   */
  isWritable () {
    return permCache.isTopicWritable(this.id)
  }

  isTopic () {
    return true
  }

  isAssoc () {
    return false
  }

  newViewTopic (viewProps) {
    return new ViewTopic({
      id:      this.id,
      uri:     this.uri,
      typeUri: this.typeUri,
      value:   this.value,
      childs: {},     // TODO: childs needed in a ViewTopic?
      viewProps: viewProps
    })
  }

  asType () {
    if (this.typeUri === 'dmx.core.topic_type') {
      return typeCache.getTopicType(this.uri)
    } else if (this.typeUri === 'dmx.core.assoc_type') {
      return typeCache.getAssocType(this.uri)
    } else {
      throw Error(`not a type: ${this}`)
    }
  }

  fillRelatingAssoc (assocDef) {
    if (this.assoc) {
      this.assoc.fillChilds()
    } else {
      this.assoc = new Assoc(assocDef.getInstanceLevelAssocType().emptyInstance())
      // Note: reactivity seems not be an issue here. I don't know why.
      // Vue.set(this, 'assoc', new Assoc(assocDef.getInstanceLevelAssocType().emptyInstance()))
    }
  }
}

class Assoc extends DMXObject {

  constructor (assoc) {
    super(assoc)
    // Note: for update models the roles are optional.
    // Compare to ModelFactoryImpl.newAssociationModel(JSONObject assoc).
    if (assoc.role1) {
      this.role1 = new Player(assoc.role1)
    }
    if (assoc.role2) {
      this.role2 = new Player(assoc.role2)
    }
  }

  // ---

  // TODO: rename to getPlayer
  getRole (roleTypeUri) {
    var match1 = this.role1.roleTypeUri === roleTypeUri
    var match2 = this.role2.roleTypeUri === roleTypeUri
    if (match1 && match2) {
      throw Error(`both role types of association ${this.id} match ${roleTypeUri}`)
    }
    return match1 ? this.role1 : match2 ? this.role2 : undefined
  }

  /**
   * @param   id    a topic ID or an assoc ID
   */
  hasPlayer (id) {
    return this.role1.id === id || this.role2.id === id
  }

  // ---

  // TODO: make it a "type" getter?
  getType () {
    return typeCache.getAssocType(this.typeUri)
  }

  get color () {
    return this.getType()._getColor() || DEFAULT_ASSOC_COLOR
  }

  isType () {
    return false    // assocs are never types
  }

  isAssocDef () {
    return this.typeUri === 'dmx.core.composition_def'
  }

  /**
   * @param   filter
   *            Optional: 1-hop traversal filtering. An object with 4 properties (each one is optional):
   *              "assocTypeUri"
   *              "myRoleTypeUri"
   *              "othersRoleTypeUri"
   *              "othersTopicTypeUri"
   *            If not specified no filter is applied.
   */
  getRelatedTopics (filter) {
    return restClient.getAssocRelatedTopics(this.id, filter)
  }

  update () {
    console.log('update', this)
    return restClient.updateAssoc(this)
  }

  /**
   * @return  a promise for a true/false value
   */
  isWritable () {
    return permCache.isAssocWritable(this.id)
  }

  isTopic () {
    return false
  }

  isAssoc () {
    return true
  }

  newViewAssoc (viewProps) {
    return new ViewAssoc({
      id:      this.id,
      uri:     this.uri,
      typeUri: this.typeUri,
      value:   this.value,
      childs: {},     // TODO: childs needed in a ViewTopic?
      role1:   this.role1,
      role2:   this.role2,
      viewProps: viewProps
    })
  }

  asAssocDef () {
    const role = this.getRole('dmx.core.parent_type')
    const type = typeCache.getTypeById(role.topicId)
    return type.getAssocDefById(this.id)
  }
}

class Player {

  constructor (player) {
    if (player.topicId === -1 || player.assocId === -1) {
      throw Error(`player ID is -1 in ${JSON.stringify(player)}`)
    }
    // TODO: arg check: player ID must not be undefined
    this.topicId     = player.topicId       // always set for topic player. 0 is a valid ID. Undefined for assoc player.
    this.topicUri    = player.topicUri      // optionally set for topic player. May be undefined.
    this.assocId     = player.assocId       // always set for assoc player. Undefined for topic player.
    this.roleTypeUri = player.roleTypeUri   // always set.
  }

  getRoleType () {
    return typeCache.getRoleType(this.roleTypeUri)
  }

  get roleTypeName () {
    return this.getRoleType().value
  }

  isTopicPlayer () {
    return this.topicId >= 0    // Note: 0 is a valid topic ID
  }

  isAssocPlayer () {
    return this.assocId
  }

  get id () {
    if (this.isTopicPlayer()) {
      return this.topicId
    } else if (this.isAssocPlayer()) {
      return this.assocId
    }
    throw Error(`player ID not set in role ${JSON.stringify(this)}`)
  }

  fetch () {
    if (this.isTopicPlayer()) {
      return restClient.getTopic(this.topicId)
    } else if (this.isAssocPlayer()) {
      return restClient.getAssoc(this.assocId)
    }
    throw Error(`player ID not set in role ${JSON.stringify(this)}`)
  }
}

class RelatedTopic extends Topic {
  constructor (topic) {
    super(topic)
    this.assoc = new Assoc(topic.assoc)
  }
}

class Type extends Topic {

  constructor (type) {
    super(type)
    this.dataTypeUri = type.dataTypeUri
    this.assocDefs   = utils.instantiateMany(type.assocDefs, AssocDef)
    this.viewConfig  = utils.mapByTypeUri(utils.instantiateMany(type.viewConfigTopics, Topic))    // TODO: rename prop?
  }

  isSimple () {
    return ['dmx.core.text', 'dmx.core.html', 'dmx.core.number', 'dmx.core.boolean'].includes(this.dataTypeUri)
  }

  isComposite () {
    return !this.isSimple()
  }

  isValue () {
    return this.dataTypeUri === 'dmx.core.value'
  }

  isIdentity () {
    return this.dataTypeUri === 'dmx.core.identity'
  }

  getDataType () {
    return typeCache.getDataType(this.dataTypeUri)
  }

  getAssocDefById (id) {
    const assocDefs = this.assocDefs.filter(assocDef => assocDef.id === id)
    if (assocDefs.length !== 1) {
      throw Error(`type "${this.uri}" has ${assocDefs.length} assoc defs with ID ${id}`)
    }
    return assocDefs[0]
  }

  // ### TODO: copy in AssocDef
  getViewConfig (childTypeUri) {
    // TODO: don't hardcode config type URI
    const configTopic = this.viewConfig['dmx.webclient.view_config']
    if (!configTopic) {
      // console.warn(`Type "${this.uri}" has no view config`)
      return
    }
    const topic = configTopic.childs[childTypeUri]
    return topic && topic.value
  }

  /**
   * @returns   a plain object.
   */
  emptyInstance () {

    const emptyChilds = () => {
      const childs = {}
      this.assocDefs.forEach(assocDef => {
        const child = assocDef.getChildType().emptyInstance()
        childs[assocDef.assocDefUri] = assocDef.isOne() ? child : [child]
      })
      return childs
    }

    return {
      id: -1,
      uri: '',
      typeUri: this.uri,
      value: '',
      childs: emptyChilds()
    }
  }

  toExternalForm () {
    const type = JSON.parse(JSON.stringify(this))
    type.assocDefs.forEach(assocDef => {
      assocDef.assocTypeUri = assocDef.typeUri
      delete assocDef.typeUri
    })
    console.log('toExternalForm', type)
    return type
  }
}

class TopicType extends Type {

  newTopicModel (simpleValue) {

    const topic = _newTopicModel(this.uri)
    topic.typeUri = this.uri
    return topic

    function _newTopicModel (typeUri) {
      const type = typeCache.getTopicType(typeUri)
      if (type.isSimple()) {
        return {
          value: simpleValue
        }
      } else {
        const assocDef = type.assocDefs[0]
        const child = _newTopicModel(assocDef.childTypeUri)
        return {
          childs: {
            [assocDef.assocDefUri]: assocDef.isOne() ? child : [child]
          }
        }
      }
    }
  }

  get icon () {
    return this._getIcon() || DEFAULT_TOPIC_TYPE_ICON
  }

  _getIcon () {
    return this.getViewConfig('dmx.webclient.icon')
  }

  isTopicType () {
    return true
  }

  isAssocType () {
    return false
  }

  update () {
    return restClient.updateTopicType(this.toExternalForm())
  }
}

class AssocType extends Type {

  _getColor () {
    return this.getViewConfig('dmx.webclient.color')
  }

  isTopicType () {
    return false
  }

  isAssocType () {
    return true
  }

  update () {
    return restClient.updateAssocType(this.toExternalForm())
  }
}

class AssocDef extends Assoc {

  constructor (assocDef) {
    super(assocDef)
    this.viewConfig = utils.mapByTypeUri(utils.instantiateMany(assocDef.viewConfigTopics, Topic))  // TODO: rename prop?
    //
    // derived properties
    //
    this.parentTypeUri = this.getRole('dmx.core.parent_type').topicUri
    this.childTypeUri  = this.getRole('dmx.core.child_type').topicUri
    //
    const customAssocType = this.childs['dmx.core.assoc_type#dmx.core.custom_assoc_type']
    this.customAssocTypeUri = customAssocType && customAssocType.uri    // may be undefined
    this.assocDefUri = this.childTypeUri + (this.customAssocTypeUri ? "#" + this.customAssocTypeUri : "")
    this.instanceLevelAssocTypeUri = this.customAssocTypeUri || this._defaultInstanceLevelAssocTypeUri()
    //
    const cardinality = this.childs['dmx.core.cardinality']
    if (cardinality) {
      this.childCardinalityUri = cardinality.uri
    } else {
      throw Error(`assoc def ${this.assocDefUri} has no cardinality child (parent type: ${this.parentTypeUri})`)
    }
    //
    const isIdentityAttr = this.childs['dmx.core.identity_attr']
    if (isIdentityAttr) {
      this.isIdentityAttr = isIdentityAttr.value
    } else {
      // ### TODO: should an isIdentityAttr child always exist?
      // console.warn(`Assoc def ${this.assocDefUri} has no identity_attr child (parent type: ${this.parentTypeUri})`)
      this.isIdentityAttr = false
    }
    //
    const includeInLabel = this.childs['dmx.core.include_in_label']
    if (includeInLabel) {
      this.includeInLabel = includeInLabel.value
    } else {
      // ### TODO: should an includeInLabel child always exist?
      //console.warn(`Assoc def ${this.assocDefUri} has no include_in_label child (parent type: ${this.parentTypeUri})`)
      this.includeInLabel = false
    }
  }

  // TODO: make these 5 derived properties?

  getChildType () {
    return typeCache.getTopicType(this.childTypeUri)
  }

  getInstanceLevelAssocType () {
    return typeCache.getAssocType(this.instanceLevelAssocTypeUri)
  }

  /**
   * Returns the custom assoc type (a dm5.AssocType object), or undefined if no one is set.
   */
  getCustomAssocType () {
    return this.customAssocTypeUri && typeCache.getAssocType(this.customAssocTypeUri)
  }

  isOne () {
    return this.childCardinalityUri === 'dmx.core.one'
  }

  isMany () {
    return this.childCardinalityUri === 'dmx.core.many'
  }

  // ---

  getViewConfig (childTypeUri) {
    const topic = this._getViewConfig(childTypeUri)
    return topic && topic.value
  }

  // ### TODO: principal copy in Type
  _getViewConfig (childTypeUri) {
    // TODO: don't hardcode config type URI
    const configTopic = this.viewConfig['dmx.webclient.view_config']
    if (!configTopic) {
      // console.warn(`Type "${this.uri}" has no view config`)
      return
    }
    return configTopic.childs[childTypeUri]
  }

  // TODO: a getViewConfig() form that falls back to the child type view config?

  _defaultInstanceLevelAssocTypeUri () {
    if (!this.isAssocDef()) {
      throw Error(`unexpected association type URI: "${this.typeUri}"`);
    }
    return 'dmx.core.composition';
  }

  emptyChildInstance () {
    const topic = this.getChildType().emptyInstance()
    topic.assoc = this.getInstanceLevelAssocType().emptyInstance()
    return new Topic(topic)
  }
}

class Topicmap extends Topic {

  constructor (topicmap) {
    super(topicmap.topic)
    this.viewProps = topicmap.viewProps
    this._topics = utils.mapById(utils.instantiateMany(topicmap.topics, ViewTopic))   // map: ID -> dm5.ViewTopic
    this._assocs = utils.mapById(utils.instantiateMany(topicmap.assocs, ViewAssoc))   // map: ID -> dm5.ViewAssoc
  }

  getTopic (id) {
    var topic = this.getTopicIfExists(id)
    if (!topic) {
      throw Error(`topic ${id} not found in topicmap ${this.id}`)
    }
    return topic
  }

  getAssoc (id) {
    var assoc = this.getAssocIfExists(id)
    if (!assoc) {
      throw Error(`assoc ${id} not found in topicmap ${this.id}`)
    }
    return assoc
  }

  getTopicIfExists (id) {
    return this._topics[id]
  }

  getAssocIfExists (id) {
    return this._assocs[id]
  }

  hasTopic (id) {
    return this.getTopicIfExists(id)
  }

  hasAssoc (id) {
    return this.getAssocIfExists(id)
  }

  /**
   * @return    all topics of this topicmap, including hidden ones (array of dm5.ViewTopic)
   */
  get topics () {
    return Object.values(this._topics)
  }

  /**
   * @return    all assocs of this topicmap, including hidden ones (array of dm5.ViewAssoc)
   */
  get assocs () {
    return Object.values(this._assocs)
  }

  /**
   * @param   topic   a dm5.ViewTopic
   */
  addTopic (topic) {
    if (!(topic instanceof ViewTopic)) {
      throw Error(`addTopic() expects a ViewTopic, got ${topic.constructor.name}`)
    }
    // reactivity is required to trigger "visibleTopicIds" getter (module dm5-cytoscape-renderer)
    Vue.set(this._topics, topic.id, topic)
  }

  /**
   * @param   assoc   a dm5.ViewAssoc
   */
  addAssoc (assoc) {
    if (!(assoc instanceof ViewAssoc)) {
      throw Error(`addAssoc() expects a ViewAssoc, got ${assoc.constructor.name}`)
    }
    // reactivity is required to trigger "visibleAssocIds" getter (module dm5-cytoscape-renderer)
    Vue.set(this._assocs, assoc.id, assoc)
  }

  /**
   * @param   topic   a dm5.Topic
   * @param   pos     Optional: the topic position (an object with "x", "y" properties).
   *                  If not given it's up to the topicmap renderer to position the topic.
   */
  revealTopic (topic, pos) {
    const op = {}
    let viewTopic = this.getTopicIfExists(topic.id)
    if (!viewTopic) {
      viewTopic = topic.newViewTopic({
        ...pos ? {
          'dmx.topicmaps.x': pos.x,
          'dmx.topicmaps.y': pos.y
        } : undefined,
        'dmx.topicmaps.visibility': true,
        'dmx.topicmaps.pinned': false
      })
      this.addTopic(viewTopic)
      op.type = 'add'
      op.viewTopic = viewTopic
    } else {
      if (!viewTopic.isVisible()) {
        viewTopic.setVisibility(true)
        op.type = 'show'
        op.viewTopic = viewTopic
      }
    }
    return op
  }

  /**
   * @param   assoc   a dm5.Assoc
   */
  revealAssoc (assoc) {
    const op = {}
    let viewAssoc = this.getAssocIfExists(assoc.id)
    if (!viewAssoc) {
      viewAssoc = assoc.newViewAssoc({
        'dmx.topicmaps.visibility': true,
        'dmx.topicmaps.pinned': false
      })
      this.addAssoc(viewAssoc)
      op.type = 'add'
      op.viewAssoc = viewAssoc
    } else {
      if (!viewAssoc.isVisible()) {
        viewAssoc.setVisibility(true)
        op.type = 'show'
        op.viewAssoc = viewAssoc
      }
    }
    return op
  }

  removeTopic (id) {
    // reactivity is required to trigger "visibleTopicIds" getter (module dm5-cytoscape-renderer)
    Vue.delete(this._topics, id)
  }

  removeAssoc (id) {
    // reactivity is required to trigger "visibleAssocIds" getter (module dm5-cytoscape-renderer)
    Vue.delete(this._assocs, id)
  }

  // Associations

  /**
   * Returns all assocs the given topic/assoc is a player in.
   *
   * @param   id    a topic ID or an assoc ID
   *
   * @return  array of dm5.ViewAssoc
   */
  getAssocsWithPlayer (id) {
    return this.assocs.filter(assoc => assoc.hasPlayer(id))
  }

  hideAssocsWithPlayer (id) {
    this.getAssocsWithPlayer(id).forEach(assoc => {
      assoc.setVisibility(false)
      this.hideAssocsWithPlayer(assoc.id)       // recursion
    })
  }

  /**
   * Removes all associations which have the given player.
   *
   * @param   id    a topic ID or an assoc ID
   */
  removeAssocsWithPlayer (id) {
    this.getAssocsWithPlayer(id).forEach(assoc => {
      this.removeAssoc(assoc.id)
      this.removeAssocsWithPlayer(assoc.id)     // recursion
    })
  }

  /**
   * @param   assoc   a dm5.Assoc or a dm5.ViewAssoc
   * @param   id      a topic ID or an assoc ID
   */
  getOtherPlayer (assoc, id) {
    let _id
    if (assoc.role1.id === id) {
      _id = assoc.role2.id
    } else if (assoc.role2.id === id) {
      _id = assoc.role1.id
    } else {
      throw Error(`${id} is not a player in assoc ${JSON.stringify(assoc)}`)
    }
    return this.getObject(_id)
  }

  // Generic

  /**
   * @param   id      a topic ID or an assoc ID
   */
  getObject (id) {
    const o = this.getTopicIfExists(id) || this.getAssocIfExists(id)
    if (!o) {
      throw Error(`topic/assoc ${id} not found in topicmap ${this.id}`)
    }
    return o
  }

  /**
   * Returns the position of the given topic/assoc.
   *
   * Note: ViewTopic has getPosition() too but ViewAssoc has not
   * as a ViewAssoc doesn't know the Topicmap it belongs to.
   *
   * @param   id      a topic ID or an assoc ID
   */
  getPosition (id) {
    const o = this.getObject(id)
    if (o.isTopic()) {
      return o.getPosition()
    } else {
      const pos1 = this.getPosition(o.role1.id)
      const pos2 = this.getPosition(o.role2.id)
      return {
        x: (pos1.x + pos2.x) / 2,
        y: (pos1.y + pos2.y) / 2
      }
    }
  }

  // Topicmap

  setPan (pan) {
    this.viewProps['dmx.topicmaps.pan_x'] = pan.x
    this.viewProps['dmx.topicmaps.pan_y'] = pan.y
  }
}

const viewPropsMixin = Base => class extends Base {

  // TODO: make it a "visible" getter?
  isVisible () {
    return this.getViewProp('dmx.topicmaps.visibility')
  }

  setVisibility (visibility) {
    this.setViewProp('dmx.topicmaps.visibility', visibility)
  }

  // TODO: make it a "pinned" getter?
  isPinned () {
    return this.getViewProp('dmx.topicmaps.pinned')
  }

  setPinned (pinned) {
    this.setViewProp('dmx.topicmaps.pinned', pinned)
  }

  getViewProp (propUri) {
    return this.viewProps[propUri]
  }

  setViewProp (propUri, value) {
    // Note: some view props must be reactive, e.g. 'dmx.topicmaps.pinned' reflects pin button state.
    // Test it with topics/assocs which don't have a 'dmx.topicmaps.pinned' setting yet. ### FIXDOC
    Vue.set(this.viewProps, propUri, value)
  }
}

class ViewTopic extends viewPropsMixin(Topic) {

  constructor (topic) {
    super(topic)
    if (!topic.viewProps) {
      throw TypeError(`"viewProps" not set in topic passed to ViewTopic constructor; topic=${JSON.stringify(topic)}`)
    }
    this.viewProps = topic.viewProps
  }

  fetchObject () {
    return restClient.getTopic(this.id, true, true)
  }

  // TODO: make it a "pos" getter?
  getPosition () {
    return {
      x: this.getViewProp('dmx.topicmaps.x'),
      y: this.getViewProp('dmx.topicmaps.y')
    }
  }

  setPosition (pos) {
    this.setViewProp('dmx.topicmaps.x', pos.x)
    this.setViewProp('dmx.topicmaps.y', pos.y)
  }
}

class ViewAssoc extends viewPropsMixin(Assoc) {

  constructor (assoc) {
    super(assoc)
    if (!assoc.viewProps) {
      throw TypeError(`"viewProps" not set in assoc passed to ViewAssoc constructor; assoc=${JSON.stringify(assoc)}`)
    }
    this.viewProps = assoc.viewProps
  }

  fetchObject () {
    return restClient.getAssoc(this.id, true, true)
  }
}

class Geomap extends Topic {
  constructor (geomap) {
    super(geomap.topic)
    // Note: we don't instantiate dm5.Topic objects as not required at the moment
    this.geoCoordTopics = geomap.geoCoordTopics
  }
}

export {
  DMXObject,
  Topic,
  Assoc,
  Player,
  RelatedTopic,
  Type,
  TopicType,
  AssocType,
  Topicmap,
  ViewTopic,
  ViewAssoc,
  Geomap
}
