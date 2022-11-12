exports.up = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.boolean('elite')
        .defaultTo(false);
    });
};

exports.down = async function (knex) {
  knex('AutosetPokemon')
    .where('tier', 'elite')
    .delete()
    .then(() => knex.schema
      .table('Pokemon', table => {
        table.dropColumn('elite');
      }));
};
