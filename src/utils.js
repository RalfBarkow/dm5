import { Topic } from './model'
import _clone from 'clone'
import _debounce from 'debounce'

/**
 * Instantiates plain objects.
 *
 * @param   objects   an array of plain objects
 * @param   clazz     the class to instantiate
 *
 * @return  array of instantiated objects
 */
function instantiateMany (objects, clazz) {
  return objects.map(object => new clazz(object))
}

// ---

function instantiateChildren (children) {
  const _children = {}
  for (var compDefUri in children) {
    _children[compDefUri] = _instantiateChild(children[compDefUri])
  }
  return _children
}

function _instantiateChild (child) {
  if (Array.isArray(child)) {
    return child.map(topic => new Topic(topic))
  } else {
    return new Topic(child)
  }
}

// ---

function clone (o) {
  return _clone(o)
}

function debounce (func, delay, immediate) {
  return _debounce(func, delay, immediate)
}

// ---

function mapById (objects) {
  return _mapByProp(objects, 'id')
}

function mapByUri (objects) {
  return _mapByProp(objects, 'uri')
}

function mapByTypeUri (objects) {
  return _mapByProp(objects, 'typeUri')
}

function _mapByProp (objects, prop) {
  const map = {}
  objects.forEach(object => map[object[prop]] = object)
  return map
}

// ---

function forEach (object, visitor) {
  for (var key in object) {
    visitor(object[key])
  }
}

function filter (object, predicate) {
  const map = {}
  for (var key in object) {
    const val = object[key]
    if (predicate(val)) {
      map[key] = val
    }
  }
  return map
}

function isEmpty (object) {
  return !Object.keys(object).length
}

// ---

/**
 * Returns a cookie value.
 *
 * @param   name    the name of the cookie, e.g. "dmx_workspace_id".
 *
 * @return  the cookie value (string) or <code>null</code> if no such cookie exist.
 */
function getCookie(name) {
  // Note: document.cookie contains all cookies as one string, e.g. "dmx_workspace_id=1234; dmx_topicmap_id=2345"
  const match = document.cookie.match(new RegExp(`\\b${name}=(\\w*)`))
  return match && match[1]
}

function setCookie (name, value) {
  document.cookie = `${name}=${value};path=/`
}

// ---

const luceneSymbols = [
  '+', '-', '&&', '||', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', 'AND', 'OR', 'NOT'
]

function containsLuceneSymbol (input) {
  return luceneSymbols.some(symbol => input.includes(symbol))
}

/**
 * Transforms user input into a Lucene query that can be used for an incremental search.
 *
 * @return    a Lucene query.
 *            If input is a single character returns empty string to signalize the caller no search should be triggered.
 */
function fulltextQuery (input) {
  let query = input.trim()
  if (!containsLuceneSymbol(input)) {
    query = query.split(/ +/).join(' AND ')
    if (query.length === 1) {     // don't search single character
      query = ''
    } else if (query && !input.endsWith(' ')) {
      query += '*'
    }
  }
  return query
}

// ---

export default {
  instantiateMany,
  instantiateChildren,
  clone,
  debounce,
  mapById,
  mapByUri,
  mapByTypeUri,
  forEach,
  filter,
  isEmpty,
  getCookie,
  setCookie,
  fulltextQuery
}
