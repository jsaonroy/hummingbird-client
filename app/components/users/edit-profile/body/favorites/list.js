import Component from 'ember-component';
import get from 'ember-metal/get';
import set from 'ember-metal/set';
import service from 'ember-service/inject';
import computed from 'ember-computed';
import { capitalize } from 'ember-string';
import { task, timeout } from 'ember-concurrency';
import { strictInvokeAction } from 'ember-invoke-action';
import { concat } from 'client/utils/computed-macros';
import InfinitePagination from 'client/mixins/infinite-pagination';

export default Component.extend(InfinitePagination, {
  store: service(),
  favorites: concat('getFavoritesTask.lastSuccessful.value', 'paginatedRecords'),
  filteredFavorites: computed('favorites.@each.{isDeleted,favRank}', function() {
    return get(this, 'favorites').rejectBy('isDeleted').sortBy('favRank');
  }).readOnly(),

  init() {
    this._super(...arguments);
    set(this, 'isCharacter', get(this, 'type') === 'character');
    get(this, 'getFavoritesTask').perform();
  },

  getFavoritesTask: task(function* () {
    const type = get(this, 'type');
    const options = {
      filter: {
        user_id: get(this, 'session.account.id'),
        item_type: capitalize(type)
      },
      include: 'item',
      sort: 'fav_rank',
      page: { limit: 20 }
    };
    return yield get(this, 'store').query('favorite', options).then((records) => {
      this.updatePageState(records);
      records.forEach((record) => {
        strictInvokeAction(this, 'addRecord', record);
      });
      return records;
    });
  }),

  searchTask: task(function* (query) {
    yield timeout(200);
    const field = get(this, 'isCharacter') ? 'name' : 'text';
    return yield get(this, 'store').query(get(this, 'type'), {
      filter: { [field]: query },
      page: { limit: 6 }
    }).then(records => records.reject(record => (
      get(this, 'favorites').map(favorite => get(favorite, 'item.id')).includes(get(record, 'id'))
    )));
  }).restartable(),

  onPagination(records) {
    this._super(records);
    records.forEach((record) => {
      strictInvokeAction(this, 'addRecord', record);
    });
  },

  actions: {
    reorderItems(orderedItems) {
      orderedItems.forEach(item => set(item, 'favRank', orderedItems.indexOf(item) + 1));
    },

    addFavorite(item) {
      const record = get(this, 'store').createRecord('favorite', {
        user: get(this, 'session.account'),
        item
      });
      get(this, 'paginatedRecords').addObject(record);
      strictInvokeAction(this, 'addRecord', record);
      // @TODO: Should be moved to adapter level
      get(this, 'session.account').incrementProperty('favoritesCount');
    },

    removeFavorite(favorite) {
      favorite.deleteRecord();
      const favorites = get(this, 'filteredFavorites');
      favorites.forEach(item => set(item, 'favRank', favorites.indexOf(item) + 1));
    }
  }
});
