package ru.oldzoomer.alfacreditbackend.repository;

import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
import ru.oldzoomer.alfacreditbackend.entity.Company;

import java.util.Optional;

@Repository
public interface CompanyRepository extends CrudRepository<Company, String> {

    Optional<Company> findByInn(String inn);

    Optional<Company> findByOgrn(String ogrn);

    @Query("SELECT * FROM companies WHERE inn = :inn OR ogrn = :inn LIMIT 1")
    Optional<Company> findByInnOrOgrn(String inn);
}
